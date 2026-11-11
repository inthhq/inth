/**
 * The JavaScript handle on the native consent kernel.
 *
 * One client per app. It reads the handshake once, decodes each snapshot
 * payload once, and hands consumers slices of that single immutable value.
 * There is deliberately no consent logic here: no evaluation, no storage, no
 * queue. The Swift and Kotlin cores own all of it, and this file only decides
 * when to pull a new snapshot and who needs to hear about it.
 *
 * Two rules shape the shape of this file:
 *
 * 1. The native side emits a revision, not a snapshot. A revision the client
 *    already holds costs nothing: no `getSnapshot()`, no `JSON.parse`.
 * 2. A subscriber is notified only when the value it selected changed, so a
 *    consent change that does not touch a component cannot rerender it.
 */

import {
	denyAllSnapshot,
	INVALID_NATIVE_SNAPSHOT_CODE,
} from '../lib/deny-all-snapshot';
import type { ConsentDecision } from '../lib/selectors';
import {
	categoryDecision,
	isCategoryAllowed,
	isSnapshotReady,
} from '../lib/selectors';
import { isTrackingPermitted } from '../lib/tracking';
import {
	describeSnapshotWireDrift,
	isProtocolVersionSupported,
	NATIVE_EVENT_NAMES,
	parseTrackingAnsweredAt,
	parseTrackingAuthorization,
	parseTrackingRequest,
	withAdditiveSnapshotDefaults,
} from '../protocol';
import type {
	BootstrapPayload,
	CommitIntent,
	CommitResult,
	ConsentSnapshot,
	NativeEventName,
	NativeOverridesInput,
	NativeTrackingRequestOptions,
	TrackingAuthorization,
	TrackingRequestPayload,
} from '../protocol';
import type * as BridgeSchema from '../protocol/bridge-schema';
import type { BridgePayloadName } from '../protocol/bridge-schema';
import type { AllConsentNames } from '../protocol/vocabulary';
import { CONSENT_CATEGORIES } from '../protocol/vocabulary';
import {
	ADDITIVE_BOOTSTRAP_DEFAULTS,
	withAdditiveIABDefaults,
} from '../protocol/wire-shape';
import { parseWebViewConsent } from '../webview/payload';
import type { WebViewConsentPayload } from '../webview/payload';
import { NativeBridgeError } from './bridge-error';
import { getNativeC15t, getNativeC15tEvents } from './module';
import type {
	NativeC15tTurboModule,
	NativeEventSubscription,
	NativeEventsLike,
} from './module';
import { C15tProtocolMismatchError } from './protocol-mismatch-error';
import { watchWithoutNativeUI } from './without-native-ui';

/**
 * Read one field out of a snapshot.
 */
export type SnapshotSelector<ResultType> = (
	snapshot: ConsentSnapshot
) => ResultType;

/**
 * Decide whether two selected values are the same for rendering purposes.
 */
export type SnapshotEquality<ResultType> = (
	current: ResultType,
	next: ResultType
) => boolean;

/**
 * The consent client the provider hands to hooks.
 */
export interface ConsentClient {
	/**
	 * Handshake payload, read once from `getBootstrap()` for the whole app.
	 */
	readonly bootstrap: BootstrapPayload;
	/**
	 * Read the current snapshot.
	 *
	 * Repeated calls on unchanged state return the identical cached object, so
	 * it is safe as a store snapshot and cheap in a render path.
	 *
	 * @returns The snapshot the native core holds, or a deny-all snapshot when
	 *   the current payload cannot be read.
	 */
	getSnapshot: () => ConsentSnapshot;
	/**
	 * Whether a category may run right now.
	 *
	 * @param category - Category to check.
	 * @returns `true` when the snapshot allows it.
	 */
	/**
	 * Why a category may or may not run, in the three states a host has to separate.
	 *
	 * `pending` while the native core has not been told yet, which is the state that
	 * tells an SDK to keep listening instead of giving up. Read off the same snapshot
	 * {@link ConsentClient.getSnapshot} returns, so the answer cannot disagree with
	 * what the consent UI is showing.
	 *
	 * @param category - Category to answer for.
	 * @returns `'granted'`, `'denied'`, or `'pending'`.
	 */
	decision: (category: AllConsentNames) => ConsentDecision;
	/**
	 * Whether a permission can be read as an answer rather than a placeholder.
	 *
	 * @returns `true` once hydration finished and the first init resolved a policy.
	 */
	isReady: () => boolean;
	/**
	 * Whether a category may run right now.
	 *
	 * @param category - Category to check.
	 * @returns `true` when the snapshot allows it.
	 */
	isAllowed: (category: AllConsentNames) => boolean;
	/**
	 * WebView consent from the native core: the state a page reads and a
	 * fresh token. `null` when the native build predates
	 * `getWebViewConsent`, or replied with something unreadable; then a
	 * WebView gets nothing and the page shows its own banner.
	 *
	 * Read through `useWebViewConsent()` rather than directly.
	 *
	 * @returns The payload, or `null`.
	 */
	getWebViewConsent: () => WebViewConsentPayload | null;
	/**
	 * What the platform says about tracking, for the category an SDK is about to
	 * start.
	 *
	 * A read of state the operating system already holds, so it is synchronous and
	 * answers on the same thread as {@link ConsentClient.isAllowed}. The answer is
	 * cached, because reading the bridge on every render would keep returning what
	 * the first read returned: Apple resolves the arm at launch, and the only events
	 * that genuinely move it are a request through {@link requestTracking} and a
	 * subject coming back from the Settings app. The second is why this cache is not
	 * permanent, and {@link refreshTrackingAuthorization} is the read that clears it.
	 *
	 * This is never a consent answer. `unsupported` means the platform asks nothing
	 * of this build, which is Android's answer always and iOS's when the binary
	 * carries no `NSUserTrackingUsageDescription`.
	 *
	 * @returns The arm the native core reported, or `denied` when it reported
	 *   nothing this build can name.
	 */
	getTrackingAuthorization: () => TrackingAuthorization;
	/**
	 * Ask the platform for tracking authorization.
	 *
	 * {@link ConsentProvider} calls it after the consent prompt closes with
	 * marketing granted, unless `trackingRequest` says otherwise. A platform
	 * prompt that arrives before the subject has been told anything is the
	 * rejection Apple writes back to the developer, and it is the ordering the ATT
	 * prompt string exists to serve.
	 *
	 * How often this can produce a prompt is Apple's decision and not this
	 * package's. Outside the European Union Apple shows its dialog once and answers
	 * from the device afterwards. Inside it, an answered request may be presented
	 * again a year after the answer, whichever way it went. So this always asks
	 * Apple and never answers from a cached arm, which is the only way an eligible
	 * install can ever be asked again, and it costs nothing when it is not eligible:
	 * Apple shows nothing and calls back with the arm on file. The provider asks
	 * only while the answer is `not-determined`, so it never re-prompts by itself.
	 *
	 * It rejects with `C15T_TRACKING_NOT_CONFIGURED` on an iOS build that carries no
	 * `NSUserTrackingUsageDescription`, because Apple then suppresses the dialog and
	 * records the answer as denied without telling the host why, and with
	 * `C15T_TRACKING_UNSUPPORTED` on Android, where there is nothing to ask.
	 *
	 * @returns The arm the platform reported after the request settled. Use
	 *   {@link requestTracking} when the answer might be a pause rather than a
	 *   decision.
	 */
	requestTrackingAuthorization: () => Promise<TrackingAuthorization>;
	/**
	 * Ask the platform, and say how the request ended.
	 *
	 * Same call as {@link requestTrackingAuthorization}, with the two fields that
	 * make Apple's Additional Information tap legible. That tap closes Apple's sheet
	 * without an answer and still reports `not-determined`, so a caller reading only
	 * the arm cannot tell "the subject stopped to read more" from "nobody has been
	 * asked yet", and reporting the first as the second tells the subject they
	 * refused something they did not.
	 *
	 * {@link useTrackingRequest} is the surface most hosts want: it drives the
	 * preference centre through the pause, so nothing has to be assembled by hand.
	 *
	 * @param options - `additionalInformation: true` asks Apple for the
	 *   Additional Information button on its EU sheet, for a caller that will
	 *   show its own controls when the request resolves with
	 *   `stage: 'additional-information'`. Without it there is no button. A
	 *   binary that predates the option shows no button either.
	 * @returns The arm, the stage, and which call ran.
	 */
	requestTracking: (options?: {
		readonly additionalInformation?: boolean;
	}) => Promise<TrackingRequestPayload>;
	/**
	 * Read the platform answer again, after a cached one.
	 *
	 * {@link getTrackingAuthorization} reads the bridge once and keeps the answer,
	 * which is right for a render path and wrong for the one moment the answer
	 * genuinely moves: the subject went to the Settings app, changed tracking, and
	 * came back. Apple tells a running process nothing when that happens, so this is
	 * the read that has to be asked for, and it is what {@link ConsentProvider} calls
	 * when the app returns to the foreground.
	 *
	 * @returns The freshly read arm, with subscribers notified only when it moved.
	 */
	refreshTrackingAuthorization: () => TrackingAuthorization;
	/**
	 * Whether tracking behaviour may run for one category.
	 *
	 * Both halves have to say yes: the c15t decision for `category` must be
	 * `granted`, and the platform must not be holding tracking back. Neither half
	 * moves the other. A device with ATT authorized and the category denied is
	 * denied, and a policy that has not resolved stays `pending` no matter what
	 * Apple reported. See {@link isTrackingPermitted}.
	 *
	 * `necessary` is not a tracking category and returns `true`, exactly as
	 * {@link ConsentClient.decision} reports it as granted.
	 *
	 * @param category - Category the caller wants to run.
	 * @returns `true` when consent and the platform both allow it.
	 */
	isTrackingAllowed: (category: AllConsentNames) => boolean;
	/**
	 * When the SDK last saw Apple answer `authorized` or `denied`, in epoch
	 * milliseconds, as of the last tracking read. `null` while no such answer is
	 * on file and on Android. Read by the yearly re-ask.
	 *
	 * @internal
	 * @returns Epoch milliseconds, or `null`.
	 */
	getTrackingAnsweredAt: () => number | null;
	/**
	 * Register interest in the platform tracking answer.
	 *
	 * The native cores push no tracking event, because there is nothing to push:
	 * the answer moves when the host asks for it and when the process relaunches.
	 * This exists so a hook can rerender on the request rather than poll the
	 * bridge.
	 *
	 * @internal
	 */
	subscribeTracking: (onTrackingChange: () => void) => () => void;
	/**
	 * Register interest in one slice of the snapshot.
	 *
	 * @param selector - Slice to watch.
	 * @param onStoreChange - Called when the selected value changes.
	 * @param equals - Comparison for the selected value. Defaults to `Object.is`.
	 * @returns A function that drops the subscription.
	 */
	subscribe: <ResultType>(
		selector: SnapshotSelector<ResultType>,
		onStoreChange: () => void,
		equals?: SnapshotEquality<ResultType>
	) => () => void;
	/**
	 * Forward a consent decision.
	 *
	 * @param intent - The action the subject took.
	 * @returns What the native core recorded.
	 */
	commit: (intent: CommitIntent) => Promise<CommitResult>;
	/**
	 * Pin geographic, language, or test overrides.
	 *
	 * @param overrides - Fields to change; omitted fields keep their value.
	 */
	setOverrides: (overrides: NativeOverridesInput) => Promise<void>;
	/**
	 * Record that the current notice was seen and dismissed. Local only.
	 */
	dismissNotice: () => void;
	/**
	 * Re-resolve policy, re-evaluate, and retry the offline queue.
	 */
	refresh: () => Promise<void>;
	/**
	 * Attach an external id and load that subject's stored record.
	 *
	 * @param externalId - Id from the app's own account system.
	 */
	identify: (externalId: string) => Promise<void>;
	/**
	 * Detach the external id. Consent stays with the c15t subject id.
	 */
	logout: () => Promise<void>;
	/**
	 * Wipe consent and go back to the state a first launch boots with.
	 *
	 * The choice prompt is owed again afterwards, so the banner or dialog comes
	 * back: this is a withdrawal, not a recorded reject-everything. The c15t
	 * subject id is kept.
	 */
	reset: () => Promise<void>;
	/**
	 * Detach from native events.
	 *
	 * @internal
	 */
	dispose: () => void;
}

/** One registered consumer and the value it last rendered. */
interface Subscriber<ResultType> {
	readonly selector: SnapshotSelector<ResultType>;
	readonly equals: SnapshotEquality<ResultType>;
	readonly onStoreChange: () => void;
	value: ResultType;
}

/**
 * Read an optional number from a native payload.
 *
 * @param payload - Parsed payload.
 * @param key - Field name.
 * @param fallback - Value to use when the field is absent or the wrong type.
 * @returns The field, or the fallback.
 */
const readNumber = function readNumber(
	payload: unknown,
	key: string,
	fallback: number
): number {
	const value = (payload as Record<string, unknown>)[key];

	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/**
 * Read an optional string from a native payload.
 *
 * @param payload - Parsed payload.
 * @param key - Field name.
 * @param fallback - Value to use when the field is absent or the wrong type.
 * @returns The field, or the fallback.
 */
const readString = function readString(
	payload: unknown,
	key: string,
	fallback: string
): string {
	const value = (payload as Record<string, unknown>)[key];

	return typeof value === 'string' ? value : fallback;
};

/**
 * Whether warnings are worth printing where this code is running.
 *
 * Read off `globalThis` because a React Native bundle may have no `process` at all,
 * depending on the polyfill the bundler chose.
 *
 * @returns `true` in a production bundle.
 * @internal
 */
export const isProduction = function isProduction(): boolean {
	return (
		(globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
			?.NODE_ENV === 'production'
	);
};

/**
 * Name the keys a native snapshot got wrong, once per distinct set of problems.
 *
 * A renamed key is the failure this catches. The bridge crosses in a JSON string, so
 * TypeScript cannot see it, and every read of the moved field returns `undefined` with
 * nothing thrown: the app just shows an empty subject, or denies a category nobody
 * denied. Unknown keys stay quiet because the contract allows a newer native build to
 * add one.
 *
 * @param problems - Lines from {@link describeSnapshotWireDrift}.
 * @param seen - Holds the last set already reported, so a repeated snapshot is quiet.
 */
const warnSnapshotDrift = function warnSnapshotDrift(
	problems: readonly string[],
	seen: { value: string | null }
): void {
	if (problems.length === 0 || isProduction()) {
		return;
	}

	const signature = problems.join('\n');

	if (seen.value === signature) {
		return;
	}

	seen.value = signature;
	console.warn(
		'c15t ConsentClient: the native snapshot does not match the declared wire shape. Consent state may read as missing.',
		problems
	);
};

/**
 * React Native's build flag. Metro replaces it with `false` in a release bundle,
 * and it is undefined outside React Native.
 */
declare const __DEV__: boolean | undefined;

/** Payload problem sets already reported, so a repeated payload stays quiet. */
const reportedBridgeDrift = new Set<string>();

/**
 * Report the drift {@link warnBridgeDrift} found, once the checker has loaded.
 *
 * @param schema - The loading bridge-schema module.
 * @param name - Which payload `parsed` is.
 * @param parsed - The parsed JSON.
 */
const reportBridgeDrift = async function reportBridgeDrift(
	schema: Promise<typeof BridgeSchema>,
	name: BridgePayloadName,
	parsed: unknown
): Promise<void> {
	const { describeBridgePayloadDrift } = await schema;
	const problems = describeBridgePayloadDrift(name, parsed, {
		allowUnknownKeys: true,
	});
	const signature = `${name}\n${problems.join('\n')}`;
	if (problems.length === 0 || reportedBridgeDrift.has(signature)) {
		return;
	}
	reportedBridgeDrift.add(signature);
	console.warn(
		`c15t ConsentClient: the native ${name} payload does not match the declared wire shape.`,
		problems
	);
};

/**
 * Name the keys a native payload got wrong, once per distinct set of problems,
 * in a development build.
 *
 * Checked against `BRIDGE_PAYLOADS`, the table `native/protocol/bridge/payloads.json`
 * is generated from, so a key one native build renamed shows up here by name
 * instead of as an `undefined` read. Keys a newer native build added stay quiet.
 *
 * The table and its checker load inside the `__DEV__` branch. Metro inlines
 * `__DEV__` as `false` in a release bundle and folds the branch away with the
 * import in it, so a release app carries none of it. The warning therefore
 * arrives a tick after the payload is read.
 *
 * @param name - Which payload `parsed` is.
 * @param parsed - The parsed JSON.
 */
const warnBridgeDrift = function warnBridgeDrift(
	name: BridgePayloadName,
	parsed: unknown
): void {
	// The import stays inside this branch: started anywhere else, Metro would keep it.
	if (typeof __DEV__ !== 'undefined' && __DEV__ && !isProduction()) {
		void reportBridgeDrift(import('../protocol/bridge-schema'), name, parsed);
	}
};

/**
 * Decide whether a parsed value can be used as a snapshot.
 *
 * Checks are shallow and target the fields the JavaScript layer actually reads,
 * so a native build that adds a field is fine and a native build that sends a
 * half-built payload is not.
 */
const isUsableSnapshot = function isUsableSnapshot(
	candidate: unknown
): candidate is ConsentSnapshot {
	if (typeof candidate !== 'object' || candidate === null) {
		return false;
	}

	const record = candidate as Record<string, unknown>;
	const permissions = record.effectivePermissions;

	return (
		typeof record.revision === 'number' &&
		Number.isFinite(record.revision) &&
		typeof record.ready === 'boolean' &&
		typeof record.policyPending === 'boolean' &&
		typeof permissions === 'object' &&
		permissions !== null &&
		CONSENT_CATEGORIES.every(
			(category) =>
				typeof (permissions as Record<string, unknown>)[category] === 'boolean'
		) &&
		typeof record.promptRequirement === 'object' &&
		record.promptRequirement !== null
	);
};

/**
 * Parse the JSON string a native call returned.
 *
 * @param raw - JSON text from the bridge.
 * @returns The parsed value, or `null` when it is not a JSON object.
 */
const parseObject = function parseObject(raw: string): unknown {
	let parsed: unknown = null;

	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
		? parsed
		: null;
};

/**
 * Read the handshake payload.
 *
 * @param raw - JSON string from `getBootstrap()`.
 * @returns The bootstrap payload.
 * @throws {NativeBridgeError} When the payload will not parse.
 * @throws {C15tProtocolMismatchError} When no protocol version is reported.
 */
const parseBootstrap = function parseBootstrap(raw: string): BootstrapPayload {
	const parsed = parseObject(raw);

	if (parsed === null) {
		throw new NativeBridgeError(
			'@c15t/react-native could not read getBootstrap(): the native module returned text that is not a JSON object. The native build does not match this JavaScript package.'
		);
	}

	// An older binary leaves out keys added since protocol version 1; fill what
	// their absence means before grading the shape, so that is not drift.
	warnBridgeDrift('bootstrap', { ...ADDITIVE_BOOTSTRAP_DEFAULTS, ...parsed });

	const {
		commitRevision,
		hasStoredSnapshot,
		nativeUI,
		protocolVersion,
		subjectId,
	} = parsed as Record<string, unknown>;

	if (typeof protocolVersion !== 'number') {
		// A native build that reports no version predates the handshake, which
		// is a mismatch rather than a parse failure.
		throw new C15tProtocolMismatchError(null);
	}

	return {
		// Only a boolean from the binary counts; an older binary sends nothing.
		commitRevision:
			typeof commitRevision === 'boolean'
				? commitRevision
				: ADDITIVE_BOOTSTRAP_DEFAULTS.commitRevision,
		hasStoredSnapshot: hasStoredSnapshot === true,
		maxSupportedProtocolVersion: readNumber(
			parsed,
			'maxSupportedProtocolVersion',
			protocolVersion
		),
		minSupportedProtocolVersion: readNumber(
			parsed,
			'minSupportedProtocolVersion',
			protocolVersion
		),
		nativeSdkVersion: readString(parsed, 'nativeSdkVersion', 'unknown'),
		// Only a boolean from the binary counts. An older binary sends nothing, and
		// ADDITIVE_BOOTSTRAP_DEFAULTS says what that means: the screens are linked.
		nativeUI:
			typeof nativeUI === 'boolean'
				? nativeUI
				: ADDITIVE_BOOTSTRAP_DEFAULTS.nativeUI,
		protocolVersion,
		subjectId: typeof subjectId === 'string' ? subjectId : null,
	};
};

/**
 * Read the revision out of a `snapshot` event payload.
 *
 * @param payload - Event payload, normally a JSON string such as
 *   `{"revision":7}`.
 * @returns The revision, or `null` when the payload does not carry one.
 */
const readEventRevision = function readEventRevision(
	payload: unknown
): number | null {
	let record: unknown = null;

	// A dictionary can arrive unserialized on Android, so both shapes are
	// accepted here rather than normalized upstream.
	if (typeof payload === 'string') {
		record = parseObject(payload);
	} else if (typeof payload === 'object' && payload !== null) {
		record = payload;
	}

	if (record === null) {
		return null;
	}

	const { revision } = record as Record<string, unknown>;

	return typeof revision === 'number' && Number.isFinite(revision)
		? revision
		: null;
};

/**
 * Build a consent client over a native module.
 *
 * The module and the emitter are injected so the client is testable without a
 * device and so an app can drive a mock through the same code path.
 *
 * @param nativeModule - The registered TurboModule.
 * @param events - Emitter for `snapshot`, `initialized`, and `error`.
 * @returns A client. Call {@link ConsentClient.dispose} to detach from events.
 * @throws {C15tProtocolMismatchError} When the native protocol is unsupported.
 * @throws {NativeBridgeError} When the bootstrap payload will not parse.
 */
export const createConsentClient = function createConsentClient(
	nativeModule: NativeC15tTurboModule,
	events: NativeEventsLike
): ConsentClient {
	const bootstrap = parseBootstrap(nativeModule.getBootstrap());

	if (!isProtocolVersionSupported(bootstrap.protocolVersion)) {
		throw new C15tProtocolMismatchError(bootstrap.protocolVersion);
	}

	/** Raw text of the snapshot last decoded, so unchanged bytes skip the parse. */
	let rawSnapshot: string | null = null;
	/** Last key drift reported, so one broken core warns once and not on every pull. */
	const drift = { value: null as string | null };
	/** Decoded snapshot, kept so consumers read one immutable object. */
	let snapshot: ConsentSnapshot | null = null;
	/** Set when native said something changed and nothing has pulled yet. */
	let stale = true;
	/** Native event subscriptions, held for the life of the client. */
	let eventSubscriptions: NativeEventSubscription[] = [];

	/**
	 * Platform tracking arm, cached between the reads that can actually move it. See
	 * {@link ConsentClient.getTrackingAuthorization} for why a read on every render
	 * is wasted work, and {@link ConsentClient.refreshTrackingAuthorization} for the
	 * one moment it is not.
	 */
	let tracking: TrackingAuthorization | null = null;
	/** When the last tracking read said the SDK last saw an answer. */
	let trackingAnsweredAt: number | null = null;
	/** Consumers that watch the platform answer and no slice of the snapshot. */
	const trackingSubscribers = new Set<() => void>();
	/** Keeps the missing-surface warning to one line per client. */
	const missingTrackingSurface = { value: false };

	const subscribers = new Set<Subscriber<unknown>>();

	/** Pull from native and decode only when the bytes actually changed. */
	const pullSnapshot = function pullSnapshot(): ConsentSnapshot {
		const raw = nativeModule.getSnapshot();

		stale = false;

		if (raw === rawSnapshot && snapshot !== null) {
			return snapshot;
		}

		rawSnapshot = raw;

		// An older binary leaves out keys added since protocol version 1; fill what
		// their absence means before anything reads or grades the payload, so the
		// public type holds and that is not drift.
		const object = parseObject(raw);
		const parsed =
			typeof object === 'object' && object !== null
				? withAdditiveIABDefaults(
						withAdditiveSnapshotDefaults(object as Record<string, unknown>)
					)
				: object;
		if (typeof parsed === 'object' && parsed !== null) {
			const problems = describeSnapshotWireDrift(parsed, {
				allowUnknownKeys: true,
			});
			const permissions = (parsed as Record<string, unknown>)
				.effectivePermissions;
			const values =
				typeof permissions === 'object' && permissions !== null
					? (permissions as Record<string, unknown>)
					: {};
			for (const category of CONSENT_CATEGORIES) {
				if (typeof values[category] !== 'boolean') {
					problems.push(
						`effectivePermissions.${category}: expected a boolean, found ${typeof values[category]}`
					);
				}
			}
			warnSnapshotDrift(problems, drift);
		}

		if (!isUsableSnapshot(parsed)) {
			snapshot = denyAllSnapshot(
				'getSnapshot() returned text that is not a readable consent snapshot, so every optional category is denied until the native core reports again.',
				snapshot?.revision ?? 0
			);

			return snapshot;
		}

		snapshot = parsed;

		return snapshot;
	};

	/** The snapshot to hand out now, pulling only when something moved. */
	const currentSnapshot = function currentSnapshot(): ConsentSnapshot {
		return stale || snapshot === null ? pullSnapshot() : snapshot;
	};

	/** Tell each subscriber whose slice moved, and only those. */
	const notify = function notify(): void {
		const current = pullSnapshot();

		for (const subscriber of [...subscribers]) {
			const next = subscriber.selector(current);

			if (subscriber.equals(subscriber.value, next)) {
				continue;
			}

			subscriber.value = next;
			subscriber.onStoreChange();
		}
	};

	/** Stop pulling for an empty tree, and re-check state on the next mount. */
	const handleEvent = function handleEvent(
		eventName: NativeEventName,
		payload: unknown
	): void {
		const revision = readEventRevision(payload);

		if (
			eventName === 'snapshot' &&
			revision !== null &&
			snapshot !== null &&
			snapshot.error?.code !== INVALID_NATIVE_SNAPSHOT_CODE &&
			revision === snapshot.revision
		) {
			return;
		}

		if (subscribers.size === 0) {
			stale = true;
			return;
		}

		notify();
	};

	const stopListening = function stopListening(): void {
		for (const subscription of eventSubscriptions) {
			subscription.remove();
		}

		eventSubscriptions = [];
	};

	const startListening = function startListening(): void {
		if (eventSubscriptions.length > 0) {
			return;
		}

		eventSubscriptions = NATIVE_EVENT_NAMES.map((eventName) =>
			events.addListener(eventName, (payload: unknown) => {
				handleEvent(eventName, payload);
			})
		);
	};

	/**
	 * Run a native mutation, then reconcile.
	 *
	 * Reconciling here rather than waiting for the event means a resolved
	 * promise and the rendered snapshot never disagree, which is what a caller
	 * that awaits `acceptAll()` and then reads `useSnapshot()` expects.
	 */
	const afterMutation = async function afterMutation<ReturnType>(
		settled: Promise<ReturnType>
	): Promise<ReturnType> {
		const value = await settled;

		stale = true;

		if (subscribers.size > 0) {
			notify();
		}

		return value;
	};

	/**
	 * Say once that the binary predates the tracking surface.
	 *
	 * A JavaScript-only update can ship a bundle that calls a method the binary in
	 * the user's hand does not have, and the protocol handshake cannot catch it:
	 * adding a method is an additive change. Failing closed is the answer that is
	 * safe to be wrong about, because the alternative reads "the native build could
	 * not tell me" as "the platform asks nothing of us" and starts tracking on a
	 * device where nobody was asked.
	 */
	const warnTrackingSurfaceMissing =
		function warnTrackingSurfaceMissing(): void {
			if (missingTrackingSurface.value || isProduction()) {
				return;
			}

			missingTrackingSurface.value = true;
			console.warn(
				'c15t ConsentClient: this native build has no tracking authorization methods, so tracking is treated as denied. Rebuild the app: a JavaScript update cannot add a native method.',
				'Rebuilding is the fix. Until then `isTrackingAllowed` answers false and `requestTrackingAuthorization` rejects.'
			);
		};

	/** The platform arm, pulled from native at most once. */
	const currentTracking = function currentTracking(): TrackingAuthorization {
		if (tracking !== null) {
			return tracking;
		}

		if (typeof nativeModule.getTrackingAuthorization !== 'function') {
			warnTrackingSurfaceMissing();

			// Left uncached on purpose: a host that rebuilds recovers without a
			// reset hook, and a warning that never repeats already covers the noise.
			return 'denied';
		}

		const raw = nativeModule.getTrackingAuthorization();
		tracking = parseTrackingAuthorization(raw);
		trackingAnsweredAt = parseTrackingAnsweredAt(raw);

		return tracking;
	};

	/** Tell the consumers that watch the platform answer and nothing else. */
	const notifyTracking = function notifyTracking(): void {
		for (const onTrackingChange of [...trackingSubscribers]) {
			onTrackingChange();
		}
	};

	/**
	 * Forward the platform request.
	 *
	 * The rejection carries the reason from the native side, which is where the
	 * difference between "this build cannot prompt" and "Android has no such
	 * question" lives.
	 */
	const requestTracking = async function requestTracking(
		options: { readonly additionalInformation?: boolean } = {}
	): Promise<TrackingRequestPayload> {
		if (typeof nativeModule.requestTrackingAuthorization !== 'function') {
			warnTrackingSurfaceMissing();

			throw new NativeBridgeError(
				'@c15t/react-native cannot request tracking authorization: this native build has no requestTrackingAuthorization method. Rebuild the app so the binary matches this package; a JavaScript update cannot add it.'
			);
		}

		let outcome: TrackingRequestPayload;

		try {
			// The button needs the options method; an older binary has only the plain one.
			const withOptions =
				options.additionalInformation === true &&
				typeof nativeModule.requestTrackingAuthorizationWithOptions ===
					'function';
			outcome = parseTrackingRequest(
				withOptions
					? await nativeModule.requestTrackingAuthorizationWithOptions(
							JSON.stringify({
								additionalInformation: true,
							} satisfies NativeTrackingRequestOptions)
						)
					: await nativeModule.requestTrackingAuthorization()
			);
		} catch (error: unknown) {
			// Whether the prompt appeared is unknown from here, so drop the cached
			// arm and let the next read ask the platform rather than trust a stale
			// one.
			tracking = null;

			throw error;
		}

		tracking = outcome.status;

		// Deliberately no `stale = true` and no snapshot notify. The platform
		// answer is not consent: a prompt that changed nothing about any category
		// must not reach a tree that subscribed to categories, and the consent
		// decision a subscriber reads has to be identical before and after.
		notifyTracking();

		return outcome;
	};

	const requestTrackingAuthorization =
		async function requestTrackingAuthorization(): Promise<TrackingAuthorization> {
			return (await requestTracking()).status;
		};

	const refreshTrackingAuthorization =
		function refreshTrackingAuthorization(): TrackingAuthorization {
			const before = tracking;

			// Dropped rather than overwritten, so the read goes through the same path a
			// first read takes, including the feature detection for a binary that has no
			// tracking surface at all.
			tracking = null;

			const after = currentTracking();

			// `before === null` means nobody had read the arm yet, so there is nothing for a
			// subscriber to be out of date about and a notification would be a rerender for
			// a value nothing was holding.
			if (before !== null && before !== after) {
				notifyTracking();
			}

			return after;
		};

	// Attach for the life of the client, not the life of a subscription. The
	// pull is still skipped while nothing is mounted, so an idle tree costs no
	// bridge reads, but a read made after a native-only change sees the change
	// instead of a cached snapshot.
	startListening();

	const commit = async function commit(
		intent: CommitIntent
	): Promise<CommitResult> {
		const raw = await nativeModule.commit(JSON.stringify(intent));
		const parsed = parseObject(raw);

		if (
			parsed === null ||
			typeof (parsed as Record<string, unknown>).ok !== 'boolean'
		) {
			throw new NativeBridgeError(
				'@c15t/react-native could not read the commit result: the native module replied with text that is not a CommitResult JSON object.'
			);
		}

		warnBridgeDrift('commitResult', parsed);

		// The only field the read path uses is `ok`, and that is guarded above.
		// Everything else rides along, so a native core that adds a field does
		// not have to wait for this package to learn about it.
		const result = parsed as CommitResult;

		return afterMutation(Promise.resolve(result));
	};

	/** Stops the checks a build without the stock native screens runs. */
	let stopWatching = (): void => undefined;

	const api: ConsentClient = {
		bootstrap,
		commit,
		decision: (category: AllConsentNames) =>
			categoryDecision(currentSnapshot(), category),
		dismissNotice: () => {
			nativeModule.dismissNotice();
			stale = true;

			if (subscribers.size > 0) {
				notify();
			}
		},
		dispose: (): void => {
			stopWatching();
			stopListening();
			trackingSubscribers.clear();
		},
		getSnapshot: currentSnapshot,
		getTrackingAnsweredAt: (): number | null => {
			currentTracking();
			return trackingAnsweredAt;
		},
		getTrackingAuthorization: currentTracking,
		getWebViewConsent: () =>
			typeof nativeModule.getWebViewConsent === 'function'
				? parseWebViewConsent(nativeModule.getWebViewConsent())
				: null,
		identify: (externalId: string) =>
			afterMutation(nativeModule.identify(externalId)),
		isAllowed: (category: AllConsentNames) =>
			isCategoryAllowed(currentSnapshot(), category),
		isReady: () => isSnapshotReady(currentSnapshot()),
		isTrackingAllowed: (category: AllConsentNames): boolean =>
			// `necessary` is not a tracking behaviour, so the platform gate does not
			// apply to it and it reads the same way `decision` reads it: granted.
			category === 'necessary' ||
			isTrackingPermitted(
				categoryDecision(currentSnapshot(), category),
				currentTracking()
			),
		logout: () => afterMutation(nativeModule.logout()),
		refresh: () => afterMutation(nativeModule.refresh()),
		refreshTrackingAuthorization,
		requestTracking,
		requestTrackingAuthorization,
		reset: async (): Promise<void> => {
			// A JavaScript update can ship a bundle that calls a wipe the binary in
			// the user's hand does not have, and the handshake cannot catch it:
			// adding a method is additive. There is no safe stand-in for a wipe
			// here, so this rejects and names the fix.
			if (typeof nativeModule.reset !== 'function') {
				throw new NativeBridgeError(
					'@c15t/react-native cannot reset consent: this native build has no reset method. Rebuild the app so the binary matches this package; a JavaScript update cannot add it.'
				);
			}

			await afterMutation(nativeModule.reset());
		},
		setOverrides: (overrides: NativeOverridesInput) =>
			afterMutation(nativeModule.setOverrides(JSON.stringify(overrides))),
		subscribe: <ResultType>(
			selector: SnapshotSelector<ResultType>,
			onStoreChange: () => void,
			equals: SnapshotEquality<ResultType> = Object.is
		): (() => void) => {
			const subscriber = {
				equals: equals as SnapshotEquality<unknown>,
				onStoreChange,
				selector: selector as SnapshotSelector<unknown>,
				// Seed from the snapshot already decoded rather than forcing a
				// pull, so a resubscribe costs no bridge read. An event that
				// arrived while nobody was mounted already set `stale`.
				value: selector(currentSnapshot()),
			};

			subscribers.add(subscriber);

			return () => {
				subscribers.delete(subscriber);
			};
		},
		subscribeTracking: (onTrackingChange: () => void): (() => void) => {
			trackingSubscribers.add(onTrackingChange);

			return () => {
				trackingSubscribers.delete(onTrackingChange);
			};
		},
	};

	// Without the stock screens nothing else can collect consent, so say when
	// nothing will.
	if (!bootstrap.nativeUI) {
		stopWatching = watchWithoutNativeUI(api, isProduction());
	}

	return api;
};

/**
 * The one client for the running app, or `null` before the first provider.
 *
 * `getBootstrap()` is the handshake and the subject read, so it happens once
 * however many providers and consumers mount.
 */
let client: ConsentClient | null = null;

/**
 * Get the app's consent client, creating it on first use.
 *
 * @returns The shared client, attached to the registered native module.
 * @throws {NativeC15tUnavailableError} When the native module is missing.
 * @throws {C15tProtocolMismatchError} When the native protocol is unsupported.
 */
export const getConsentClient = function getConsentClient(): ConsentClient {
	if (client === null) {
		client = createConsentClient(getNativeC15t(), getNativeC15tEvents());
	}

	return client;
};

/**
 * Drop the shared client and its native listener.
 *
 * Host-app tests need this between cases, and a test harness that swaps the
 * native module needs it too. Production code should never call it: the client
 * lives as long as the app.
 *
 * @internal
 */
export const resetConsentClient = function resetConsentClient(): void {
	client?.dispose();
	client = null;
};
