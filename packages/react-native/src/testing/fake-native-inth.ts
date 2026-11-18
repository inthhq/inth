/**
 * A fake of the native consent core, speaking the same JSON strings over the
 * same Codegen surface as the Swift and Kotlin modules.
 *
 * `@inth/react-native/testing` builds its test client on this, and the
 * package's own tests build their counting double on it too, so there is one
 * fake and not two that drift apart. It holds no consent logic beyond what a
 * test has to see move: a commit changes the permissions it names, a reset
 * goes back to a first launch, and the presenter opens and closes sessions.
 */

import type { NativeInthTurboModule } from '../native/module';
import type { NativeAutoPresentSettings } from '../native/presenter';
import type {
	CommitIntent,
	CommitResult,
	ConsentSnapshot,
	TrackingAuthorization,
	TrackingPresentation,
	TrackingRequestStage,
} from '../protocol';
import type {
	CategoryDecision,
	ExplicitChoice,
	OptionalConsentCategory,
} from '../protocol/vocabulary';
import { OPTIONAL_CONSENT_CATEGORIES } from '../protocol/vocabulary';
import { isPrivacyPolicyURL } from '../provider/privacy-policy-url';

/** The handshake a current native build reports. */
export const FAKE_BOOTSTRAP = {
	commitRevision: true,
	hasStoredSnapshot: true,
	maxSupportedProtocolVersion: 1,
	minSupportedProtocolVersion: 1,
	nativeSdkVersion: 'rn->9.9.9',
	nativeUI: true,
	protocolVersion: 1,
	subjectId: 'sub-1',
};

/** The evaluation time every fake snapshot carries, so tests stay deterministic. */
export const FAKE_EVALUATED_AT = 1_770_000_000_000;

/**
 * Build a snapshot with realistic defaults: ready, opt-in in Germany, a
 * choice owed, functionality on by default.
 *
 * @param overrides - Fields to replace, shallow over the defaults.
 * @returns A snapshot the client accepts.
 */
export const buildFakeSnapshot = function buildFakeSnapshot(
	overrides: Partial<ConsentSnapshot> = {}
): ConsentSnapshot {
	return {
		activeUI: 'banner',
		consentCategories: null,
		effectivePermissions: {
			experience: false,
			functionality: true,
			marketing: false,
			measurement: false,
			necessary: true,
		},
		error: null,
		evaluatedAt: FAKE_EVALUATED_AT,
		explicitChoice: null,
		gppString: null,
		iab: null,
		iabMarketingPurposes: null,
		location: { countryCode: 'DE', regionCode: null },
		model: 'opt-in',
		nextDeadline: null,
		overrides: { country: 'DE', gpc: null, language: 'en', region: null },
		policyPending: false,
		policySnapshotToken: null,
		privacySignals: { gpc: { active: false, detected: false, override: null } },
		promptOwedSince: null,
		promptRequirement: { kind: 'choice', reason: 'missing' },
		ready: true,
		resolution: { fingerprint: null, policyId: null, status: 'no-match' },
		restrictions: {},
		revision: 0,
		subject: { subjectId: 'sub-1' },
		translations: null,
		...overrides,
	};
};

/** The optional categories a snapshot's policy asks about. */
const inScopeOptional = function inScopeOptional(
	snapshot: ConsentSnapshot
): readonly OptionalConsentCategory[] {
	const scope = snapshot.consentCategories;
	return scope === null
		? OPTIONAL_CONSENT_CATEGORIES
		: OPTIONAL_CONSENT_CATEGORIES.filter((category) =>
				scope.includes(category)
			);
};

/**
 * The fields a stored explicit choice sets, from one decision per category.
 *
 * @param consents - The value for each optional category.
 * @param revision - The revision the choice lands at.
 * @param current - The snapshot the choice replaces.
 * @returns The next snapshot: permissions applied, nothing owed, no UI.
 */
export const withExplicitChoice = function withExplicitChoice(
	current: ConsentSnapshot,
	consents: Readonly<Record<OptionalConsentCategory, boolean>>,
	revision: number,
	receipts: Readonly<
		Partial<Record<OptionalConsentCategory, boolean>>
	> = consents,
	answeredBefore: readonly OptionalConsentCategory[] = Object.keys(
		current.explicitChoice?.categories ?? {}
	) as OptionalConsentCategory[]
): ConsentSnapshot {
	// Receipts accumulate: a save records the categories it names, with the
	// value it sent, and keeps the ones earlier saves recorded, as both cores
	// do. A receipt outside the scope is kept for a later policy to reuse.
	const categories: Partial<Record<OptionalConsentCategory, CategoryDecision>> =
		{ ...current.explicitChoice?.categories };

	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const value = receipts[category];
		if (value !== undefined) {
			categories[category] = {
				basis: { fingerprint: 'test', kind: 'choice-v1' },
				confirmedAt: FAKE_EVALUATED_AT,
				value,
			};
		}
	}

	// An action that confirmed no category acknowledges the prompt and leaves
	// the stored choice as it was, as both cores do.
	const explicitChoice: ExplicitChoice | null =
		Object.keys(receipts).length === 0
			? current.explicitChoice
			: { categories, version: 3 };
	// A restricted category stays denied whatever its receipt says, as both
	// policy evaluators force it, for example under GPC.
	const effective: Record<OptionalConsentCategory, boolean> = { ...consents };
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		if ((current.restrictions[category]?.length ?? 0) > 0) {
			effective[category] = false;
		}
	}
	const next = {
		...current,
		effectivePermissions: { necessary: true, ...effective },
		explicitChoice,
		revision,
	};

	// A save answers a choice, never a notice: a notice needs its own
	// acknowledgement, as in both cores.
	if (current.promptRequirement.kind === 'notice') {
		return next;
	}
	// A receipt for some categories does not settle a prompt that asked for
	// more: the prompt stays owed while any category in scope is unanswered.
	// Only answers given since the prompt became owed count, so receipts a
	// re-consent prompt replaced do not settle it.
	const answers = new Set([
		...answeredBefore,
		...(Object.keys(receipts) as OptionalConsentCategory[]),
	]);
	const answered = inScopeOptional(current).every((category) =>
		answers.has(category)
	);
	return answered
		? {
				...next,
				activeUI: null,
				promptOwedSince: null,
				promptRequirement: { kind: 'none' },
			}
		: next;
};

/**
 * The receipt each category gets from a commit: the bulk actions answer the
 * choice scope, and explicit and IAB saves answer exactly the categories they
 * send, in scope or not, as both cores do.
 *
 * @param snapshot - The snapshot the commit applies to.
 * @param intent - What the app or the prompt saved.
 * @returns The value recorded for each answered category.
 */
const receiptsForIntent = function receiptsForIntent(
	snapshot: ConsentSnapshot,
	intent: CommitIntent
): Partial<Record<OptionalConsentCategory, boolean>> {
	if (intent.action === 'all' || intent.action === 'necessary') {
		const value = intent.action === 'all';
		return Object.fromEntries(
			inScopeOptional(snapshot).map((category) => [category, value])
		);
	}
	const receipts: Partial<Record<OptionalConsentCategory, boolean>> = {};
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const value = intent.consents[category];
		if (value !== undefined) {
			receipts[category] = value;
		}
	}
	return receipts;
};

/**
 * The categories a commit records receipts for, whatever their value: every
 * category in scope for accept all and reject all, the named ones for a
 * per-category save.
 *
 * @param snapshot - The snapshot the commit applies to.
 * @param intent - What the app or the prompt saved.
 * @returns The categories the commit result reports as confirmed.
 */
export const confirmedForIntent = function confirmedForIntent(
	snapshot: ConsentSnapshot,
	intent: CommitIntent
): readonly OptionalConsentCategory[] {
	return Object.keys(receiptsForIntent(snapshot, intent)).filter(
		(category): category is OptionalConsentCategory =>
			OPTIONAL_CONSENT_CATEGORIES.includes(category as OptionalConsentCategory)
	);
};

/**
 * The permission each category gets from a commit intent.
 *
 * A commit acts only on the categories the policy asks about; the rest keep
 * the value the policy gives them, as both cores do.
 *
 * @param current - Permissions before the commit.
 * @param intent - What the app or the prompt saved.
 * @param scope - The categories in the choice scope. @default every optional one
 * @returns One value per optional category.
 */
export const consentsForIntent = function consentsForIntent(
	current: ConsentSnapshot['effectivePermissions'],
	intent: CommitIntent,
	scope: readonly OptionalConsentCategory[] = OPTIONAL_CONSENT_CATEGORIES
): Record<OptionalConsentCategory, boolean> {
	const next = {} as Record<OptionalConsentCategory, boolean>;

	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		if (!scope.includes(category)) {
			next[category] = current[category];
		} else if (intent.action === 'all') {
			next[category] = true;
		} else if (intent.action === 'necessary') {
			next[category] = false;
		} else {
			next[category] = intent.consents[category] ?? current[category];
		}
	}

	return next;
};

/** A session the fake presenter has on screen. */
export interface FakePresenterSession {
	/** The id the presenter returned when it opened. */
	readonly sessionId: string;
	/** What it shows: the owed prompt or standing preferences. */
	readonly presentation: 'prompt' | 'preferences';
	/** `true` when native opened it by itself, `false` when the app asked. */
	readonly automatic: boolean;
}

/** How the fake answers a tracking request. `code` makes it reject instead. */
export interface FakeTrackingReply {
	readonly code?: string;
	readonly message?: string;
	readonly presentation?: TrackingPresentation;
	readonly stage?: TrackingRequestStage;
	readonly status?: TrackingAuthorization;
}

/** Options for {@link createFakeNativeInth}. */
export interface FakeNativeInthOptions {
	/** Deliver one native event, as the module's emitter would. */
	readonly emit: (eventName: string, payload: string) => void;
	/** The snapshot served first. */
	readonly snapshot?: ConsentSnapshot;
	/** The handshake payload served first. */
	readonly bootstrap?: unknown;
	/** The platform tracking answer served first. @default 'unsupported' */
	readonly trackingAuthorization?: TrackingAuthorization;
	/**
	 * Whether a commit changes the served snapshot, the way a native core does.
	 * The package's own tests turn it off to push every snapshot by hand.
	 *
	 * @default true
	 */
	readonly applyCommits?: boolean;
	/**
	 * Whether the presenter opens an owed prompt by itself once auto-present is
	 * on, the way the native `ConsentPrompt` does. The package's own tests turn
	 * it off to report every presentation by hand.
	 *
	 * @default true
	 */
	readonly autoPresents?: boolean;
}

/** A fake native core: the module plus the controls a test drives it with. */
export interface FakeNativeInth {
	/** The module, in the shape the TurboModule registry returns. */
	readonly nativeModule: NativeInthTurboModule;
	/** The snapshot served now, or the raw text when a test made it unreadable. */
	readonly snapshot: () => ConsentSnapshot | string;
	/**
	 * The policy a `reset()` cleared, so the next init can resolve it again,
	 * or `null` when no reset is waiting for one.
	 */
	readonly policyBeforeReset: () => Pick<
		ConsentSnapshot,
		'location' | 'model' | 'resolution' | 'restrictions' | 'translations'
	> | null;
	/** Serve a new snapshot and emit the `snapshot` event for it. */
	readonly pushSnapshot: (
		next: ConsentSnapshot | string,
		revision?: number
	) => void;
	/** Replace the handshake served by the next `getBootstrap()`. */
	readonly setBootstrap: (payload: unknown) => void;
	/** Commit intents the module received, parsed, in order. */
	readonly commits: CommitIntent[];
	/** Serve this text from every later `commit()` instead of a result. */
	readonly failCommitWith: (raw: string) => void;
	/** Serve a different platform tracking answer from the next read. */
	readonly setTrackingAuthorization: (status: TrackingAuthorization) => void;
	/** Serve `answeredAt` with the tracking answer, or leave it out with `null`. */
	readonly setTrackingAnsweredAt: (answeredAt: number | null) => void;
	/** Answer the next tracking requests with these, in order, then with `fallback`. */
	readonly tracking: {
		fallback: FakeTrackingReply;
		readonly queue: FakeTrackingReply[];
		readonly payloads: string[];
	};
	/** The settings `configureAutoPresent()` was handed, in order. */
	readonly autoPresentSettings: NativeAutoPresentSettings[];
	/** The session on screen, or `null`. */
	readonly session: () => FakePresenterSession | null;
	/**
	 * Close the open session with a subject's answer, the way the native screens
	 * do: the snapshot event for a saved choice first, then the outcome.
	 *
	 * @param kind - How the session ended.
	 * @param intent - What the subject saved, for `committed`.
	 * @throws {Error} When no session is open.
	 */
	readonly closeSession: (
		kind: 'committed' | 'acknowledged' | 'dismissed',
		intent?: CommitIntent
	) => void;
}

/** Serialize a snapshot the way the native modules hand one over. */

const serialize = function serialize(value: ConsentSnapshot | string): string {
	return typeof value === 'string' ? value : JSON.stringify(value);
};

/**
 * Create a fake native core.
 *
 * @param options - What to serve first, and where events go.
 * @returns The module and its controls.
 */
export const createFakeNativeInth = function createFakeNativeInth(
	options: FakeNativeInthOptions
): FakeNativeInth {
	const { emit } = options;
	const applyCommits = options.applyCommits ?? true;
	const autoPresents = options.autoPresents ?? true;
	let snapshot: ConsentSnapshot | string =
		options.snapshot ?? buildFakeSnapshot();
	let bootstrap: unknown = options.bootstrap ?? FAKE_BOOTSTRAP;
	let trackingStatus: TrackingAuthorization =
		options.trackingAuthorization ?? 'unsupported';
	let trackingAnsweredAt: number | null = null;
	let commitReply: string | null = null;
	let session: FakePresenterSession | null = null;
	let sessionCount = 0;
	const commits: CommitIntent[] = [];
	const autoPresentSettings: NativeAutoPresentSettings[] = [];
	const tracking: FakeNativeInth['tracking'] = {
		fallback: { status: trackingStatus },
		payloads: [],
		queue: [],
	};

	/** The snapshot as an object, treating unreadable text as a fresh launch. */
	const current = (): ConsentSnapshot =>
		typeof snapshot === 'string' ? buildFakeSnapshot() : snapshot;

	/** The snapshot revision the open screen's draft was built on. */
	let sessionRevision = 0;

	/**
	 * Receipts that still count when a prompt is owed. The fake records no
	 * receipt lifetimes, so it reads the requirement as both cores would have
	 * set it: a prompt owed only for `missing` categories keeps the receipts it
	 * has, while `expired` and `policy-changed` ones no longer hold.
	 */
	const validReceipts = (
		value: ConsentSnapshot
	): readonly OptionalConsentCategory[] =>
		value.promptRequirement.kind === 'choice' &&
		value.promptRequirement.reason === 'missing'
			? (Object.keys(
					value.explicitChoice?.categories ?? {}
				) as OptionalConsentCategory[])
			: [];

	/** The policy the last `reset()` cleared, until the next init restores it. */
	let clearedPolicy: ReturnType<FakeNativeInth['policyBeforeReset']> = null;

	/** The categories answered since the owed prompt became owed. */
	const answeredSinceOwed = new Set<OptionalConsentCategory>(
		validReceipts(current())
	);

	/**
	 * When the prompt `next` owes became owed, by the cores' rule: nothing owed
	 * is `null`, the same requirement under the same policy keeps its earlier
	 * value, and anything else owed starts at `next`'s revision.
	 */
	const owedSince = (
		previous: ConsentSnapshot,
		next: ConsentSnapshot
	): number | null => {
		const owed = next.promptRequirement;
		if (owed.kind === 'none') {
			return null;
		}
		const before = previous.promptRequirement;
		const same =
			before.kind === owed.kind &&
			('reason' in before ? before.reason : null) ===
				('reason' in owed ? owed.reason : null) &&
			previous.resolution.fingerprint === next.resolution.fingerprint;
		return same ? (previous.promptOwedSince ?? next.revision) : next.revision;
	};

	/**
	 * Install the next state the way both cores do, so every change of the
	 * snapshot names its owed prompt and an open screen's draft reacts to it.
	 */
	const install = (next: ConsentSnapshot | string): void => {
		const previous = current();
		snapshot =
			typeof next === 'string'
				? next
				: { ...next, promptOwedSince: owedSince(previous, next) };
		// A newly owed prompt asks again: earlier answers do not count for it.
		if (current().promptOwedSince !== previous.promptOwedSince) {
			answeredSinceOwed.clear();
			for (const category of validReceipts(current())) {
				answeredSinceOwed.add(category);
			}
		}
		// An answer only counts while its receipt is still stored: a state that
		// removed the choice, such as setConsent('unset'), removes it too.
		const stored = current().explicitChoice?.categories ?? {};
		for (const category of [...answeredSinceOwed]) {
			if (!(category in stored)) {
				answeredSinceOwed.delete(category);
			}
		}
		// A clean draft follows the record while a session shows it: the first
		// layer always, standing preferences once an unresolved policy resolves,
		// as the native presenters do. Any other draft keeps the revision it
		// opened on, and its save is refused as stale.
		if (
			session !== null &&
			(session.presentation === 'prompt' ||
				(previous.policyPending && !current().policyPending))
		) {
			sessionRevision = current().revision;
		}
	};

	const pushSnapshot = (next: ConsentSnapshot | string, revision?: number) => {
		install(next);
		emit(
			'snapshot',
			JSON.stringify({
				revision: revision ?? (typeof next === 'string' ? 99 : next.revision),
			})
		);
	};

	/** Store a choice the way the native core does: next revision, nothing owed. */
	const store = (intent: CommitIntent): ConsentSnapshot => {
		const before = current();
		const receipts = receiptsForIntent(before, intent);
		const next = withExplicitChoice(
			before,
			consentsForIntent(
				before.effectivePermissions,
				intent,
				inScopeOptional(before)
			),
			before.revision + 1,
			receipts,
			[...answeredSinceOwed]
		);
		for (const category of Object.keys(receipts)) {
			answeredSinceOwed.add(category as OptionalConsentCategory);
		}
		install(next);
		return current();
	};

	const isPromptOwed = (): boolean => {
		const value = current();
		return (
			value.ready &&
			!value.policyPending &&
			value.promptRequirement.kind !== 'none'
		);
	};

	const open = (
		presentation: 'prompt' | 'preferences',
		automatic: boolean
	): FakePresenterSession => {
		sessionCount += 1;
		session = { automatic, presentation, sessionId: `session-${sessionCount}` };
		sessionRevision = current().revision;
		emit('onConsentPresenterPresented', JSON.stringify(session));
		return session;
	};

	/**
	 * Names the owed prompt the way the native presenters do, so a prompt the
	 * subject dismissed is not opened again by itself until it changes.
	 */
	const promptKey = (value: ConsentSnapshot): string => {
		const requirement = value.promptRequirement;
		const reason = 'reason' in requirement ? requirement.reason : '';
		return `${value.resolution.fingerprint ?? ''}:${requirement.kind}:${reason}:${value.promptOwedSince ?? ''}`;
	};

	/** The prompt the subject last dismissed, which auto-present skips. */
	let suppressedPrompt: string | null = null;

	/** Present an owed prompt by itself, as native does once it is allowed to. */
	const autoPresentIfOwed = (): void => {
		const settings = autoPresentSettings.at(-1);
		if (
			autoPresents &&
			settings?.autoPresent === true &&
			session === null &&
			isPromptOwed() &&
			suppressedPrompt !== promptKey(current())
		) {
			open('prompt', true);
		}
	};

	/**
	 * Record a notice acknowledgement as both cores do: locally, closing the
	 * notice and publishing the next snapshot. Nothing else is owed by a notice.
	 *
	 * @returns `false` when no notice is owed, and nothing changed.
	 */
	const acknowledgeNotice = (): boolean => {
		const value = current();
		if (value.promptRequirement.kind !== 'notice') {
			return false;
		}
		install({
			...value,
			activeUI: null,
			promptOwedSince: null,
			promptRequirement: { kind: 'none' },
			revision: value.revision + 1,
		});
		emit('snapshot', JSON.stringify({ revision: value.revision + 1 }));
		return true;
	};

	/**
	 * End the open session with its outcome, as both hosts do. A dismissed
	 * choice prompt is suppressed until it changes; a dismissed notice is not.
	 * A screen closed while the policy is pending ends as unavailable.
	 */
	const endSession = (
		kind: 'committed' | 'acknowledged' | 'dismissed',
		closing: FakePresenterSession
	): void => {
		const value = current();
		if (
			kind === 'dismissed' &&
			closing.presentation === 'prompt' &&
			value.promptRequirement.kind === 'choice'
		) {
			suppressedPrompt = promptKey(value);
		}
		session = null;
		emit(
			'onConsentPresenterOutcome',
			JSON.stringify({
				kind:
					kind === 'dismissed' && value.policyPending ? 'unavailable' : kind,
				revision: value.revision,
				sessionId: closing.sessionId,
			})
		);
		// Both hosts reconcile once a session ends: a prompt still owed after
		// standing preferences close is presented now.
		autoPresentIfOwed();
	};

	const closeSession: FakeNativeInth['closeSession'] = (kind, intent) => {
		const closing = session;
		if (closing === null) {
			throw new Error(
				'No consent prompt or preferences screen is open. Render a <ConsentProvider> that presents (the default), or call presentConsentPrompt() or presentPreferences(), before answering it.'
			);
		}
		// The notice prompt offers Acknowledge and Privacy settings, not a
		// consent choice, as on both platforms.
		if (
			kind === 'committed' &&
			closing.presentation === 'prompt' &&
			current().promptRequirement.kind === 'notice'
		) {
			throw new Error(
				'The open screen is a notice, which records no consent choice. Answer it with acknowledge(), or open preferences to choose.'
			);
		}
		// While the policy is pending the notice on screen is stale: both cores
		// refuse to record its acknowledgement, and the screen stays open.
		if (kind === 'acknowledged' && current().policyPending) {
			return;
		}
		// Acknowledge is on the notice prompt only, not on preferences.
		if (
			kind === 'acknowledged' &&
			(closing.presentation !== 'prompt' || !acknowledgeNotice())
		) {
			throw new Error(
				'The open screen is not a notice. Only a notice has Acknowledge; answer a choice prompt with acceptAll(), rejectAll() or save().'
			);
		}
		// The native screens save through the core and close only on success,
		// so an answer while the policy is pending leaves the screen open and
		// stores nothing.
		if (kind === 'committed' && current().policyPending) {
			return;
		}
		// The screen's draft keeps the revision it opened on; when consent moved
		// meanwhile, both cores refuse it as concurrent-change and the screen
		// stays open.
		if (kind === 'committed' && current().revision !== sessionRevision) {
			return;
		}
		if (kind === 'committed') {
			const next = store(intent ?? { action: 'necessary' });
			emit('snapshot', JSON.stringify({ revision: next.revision }));
		}
		// Closing the prompt without an answer settles it until it changes;
		// closing standing preferences does not.
		endSession(kind, closing);
	};

	const presentSession = (presentation: 'prompt' | 'preferences'): string => {
		if (session !== null) {
			return JSON.stringify({
				presentation: session.presentation,
				sessionId: session.sessionId,
				status: 'already-presented',
			});
		}
		if (presentation === 'prompt' && !isPromptOwed()) {
			return JSON.stringify({ sessionId: null, status: 'not-required' });
		}
		const opened = open(presentation, false);
		return JSON.stringify({
			presentation,
			sessionId: opened.sessionId,
			status: 'presented',
		});
	};

	const answerTracking = (): Promise<string> => {
		const reply = tracking.queue.shift() ?? tracking.fallback;
		if (reply.code !== undefined) {
			return Promise.reject(
				Object.assign(new Error(reply.message ?? ''), { code: reply.code })
			);
		}
		trackingStatus = reply.status ?? trackingStatus;
		// `JSON.stringify` drops undefined keys, which is the shape an older binary sends.
		const payload = JSON.stringify({
			presentation: reply.presentation,
			stage: reply.stage,
			status: trackingStatus,
		});
		tracking.payloads.push(payload);
		return Promise.resolve(payload);
	};

	/** One flag of the bootstrap, which a test may have made malformed. */
	const bootstrapFlag = (name: 'commitRevision' | 'nativeUI'): unknown =>
		typeof bootstrap === 'object' && bootstrap !== null
			? (bootstrap as Record<string, unknown>)[name]
			: undefined;

	/**
	 * What both cores do before presenting: a build without the stock screens
	 * refuses, and so does a privacy policy URL that is not absolute HTTPS
	 * with a host.
	 */
	const present = (
		presentation: 'prompt' | 'preferences',
		privacyPolicyURL: string
	): Promise<string> => {
		if (bootstrapFlag('nativeUI') === false) {
			return Promise.reject(
				Object.assign(
					new Error(
						'This build leaves out the stock consent screens (inth.nativeUI is false). Render your own consent UI with the headless hooks.'
					),
					{ code: 'INTH_NATIVE_UI_EXCLUDED' }
				)
			);
		}
		if (!isPrivacyPolicyURL(privacyPolicyURL)) {
			return Promise.reject(
				Object.assign(
					new Error(
						'The privacy-policy URL is not an absolute HTTPS URL with a host.'
					),
					{ code: 'INTH_PRESENTER_INVALID_URL' }
				)
			);
		}
		return Promise.resolve(presentSession(presentation));
	};

	const nativeModule: NativeInthTurboModule = {
		addListener: () => undefined,
		closeConsentPresenter: (sessionId: string) => {
			if (session?.sessionId === sessionId) {
				closeSession('dismissed');
			}
			return Promise.resolve();
		},
		commit: (intent: string) => {
			const parsed = JSON.parse(intent) as CommitIntent;
			commits.push(parsed);
			if (commitReply !== null) {
				return Promise.resolve(commitReply);
			}
			// Both cores refuse a save before the policy resolves.
			if (current().policyPending) {
				const pending: CommitResult = {
					confirmed: [],
					ok: false,
					queued: false,
					reason: 'policy-pending',
					revision: null,
					subjectId: current().subject?.subjectId ?? null,
				};
				return Promise.resolve(JSON.stringify(pending));
			}
			// A draft carries the revision it was opened on; both cores refuse it
			// once the snapshot has moved, and change nothing.
			const base = 'revision' in parsed ? parsed.revision : undefined;
			if (
				bootstrapFlag('commitRevision') === true &&
				typeof base === 'number' &&
				base !== current().revision
			) {
				const refused: CommitResult = {
					confirmed: [],
					ok: false,
					queued: false,
					reason: 'concurrent-change',
					revision: null,
					subjectId: current().subject?.subjectId ?? null,
				};
				return Promise.resolve(JSON.stringify(refused));
			}
			const confirmed = confirmedForIntent(current(), parsed);
			const next = applyCommits ? store(parsed) : current();
			const result: CommitResult = {
				// Every category this action recorded, granted or denied.
				confirmed: [...confirmed],
				ok: true,
				queued: false,
				revision: next.revision,
				subjectId: next.subject?.subjectId ?? null,
			};
			if (applyCommits) {
				emit('snapshot', JSON.stringify({ revision: next.revision }));
			}
			return Promise.resolve(JSON.stringify(result));
		},
		configureAutoPresent: (settings: string) => {
			autoPresentSettings.push(
				JSON.parse(settings) as NativeAutoPresentSettings
			);
			autoPresentIfOwed();
			return Promise.resolve();
		},
		dismissNotice: () => {
			if (!acknowledgeNotice()) {
				return;
			}
			const value = current();
			const closing = session;
			// Only the notice prompt ends; standing preferences stay open.
			if (closing?.presentation === 'prompt') {
				session = null;
				emit(
					'onConsentPresenterOutcome',
					// Cleared from code, not by the screen's Acknowledge action: both
					// hosts end such a session as dismissed.
					JSON.stringify({
						kind: 'dismissed',
						revision: value.revision,
						sessionId: closing.sessionId,
					})
				);
			}
		},
		getBootstrap: () => JSON.stringify(bootstrap),
		getSnapshot: () => serialize(snapshot),
		getTrackingAuthorization: () =>
			JSON.stringify(
				trackingAnsweredAt === null
					? { status: trackingStatus }
					: { answeredAt: trackingAnsweredAt, status: trackingStatus }
			),
		getWebViewConsent: () => {
			const value = current();
			return JSON.stringify({
				key: 'fedcba9876543210fedcba9876543210',
				state: {
					// Both bridges read the snapshot's GPP string into the WebView state.
					gppString: value.gppString,
					model: value.model,
					permissions: value.effectivePermissions,
					ready: value.ready && !value.policyPending,
					revision: value.revision,
					tcString: null,
					version: 1,
				},
				token: '0123456789abcdef0123456789abcdef',
			});
		},
		identify: () => Promise.resolve(),
		logout: () => Promise.resolve(),
		presentConsentPrompt: (privacyPolicyURL: string) =>
			present('prompt', privacyPolicyURL),
		presentPreferences: (privacyPolicyURL: string) =>
			present('preferences', privacyPolicyURL),
		refresh: () => Promise.resolve(),
		removeListeners: () => undefined,
		requestTrackingAuthorization: answerTracking,
		requestTrackingAuthorizationWithOptions: answerTracking,
		reset: () => {
			// The cold-start baseline both cores publish after a wipe, as in
			// packages/native-protocol/reset-consent-opt-in-grants.json: consent and the
			// resolved policy are gone, and only the subject, overrides, privacy
			// signals and category scope carry over until the next init.
			const value = current();
			// Keep the policy the snapshot carries unless an earlier reset
			// already cleared it, whether or not start-up had finished: the
			// cores initialize again either way.
			clearedPolicy =
				value.resolution.status === 'unconfigured'
					? clearedPolicy
					: {
							location: value.location,
							model: value.model,
							resolution: value.resolution,
							restrictions: value.restrictions,
							translations: value.translations,
						};
			install(
				buildFakeSnapshot({
					activeUI: 'none',
					consentCategories: value.consentCategories,
					effectivePermissions: {
						experience: false,
						functionality: false,
						marketing: false,
						measurement: false,
						necessary: true,
					},
					location: null,
					overrides: value.overrides,
					policyPending: true,
					privacySignals: value.privacySignals,
					promptRequirement: { kind: 'none' },
					ready: false,
					resolution: {
						fingerprint: null,
						policyId: null,
						status: 'unconfigured',
					},
					revision: value.revision + 1,
					subject: value.subject,
				})
			);
			// The baseline owes nothing, so both hosts end a screen still showing
			// as unavailable.
			const closing = session;
			if (closing !== null) {
				session = null;
				emit(
					'onConsentPresenterOutcome',
					JSON.stringify({
						kind: 'unavailable',
						revision: value.revision + 1,
						sessionId: closing.sessionId,
					})
				);
			}
			return Promise.resolve();
		},
		setOverrides: () => Promise.resolve(),
	};

	return {
		autoPresentSettings,
		closeSession,
		commits,
		failCommitWith: (raw: string) => {
			commitReply = raw;
		},
		nativeModule,
		policyBeforeReset: () => clearedPolicy,
		pushSnapshot: (next, revision) => {
			pushSnapshot(next, revision);
			autoPresentIfOwed();
		},
		session: () => session,
		setBootstrap: (payload: unknown) => {
			bootstrap = payload;
		},
		setTrackingAnsweredAt: (answeredAt: number | null) => {
			trackingAnsweredAt = answeredAt;
		},
		setTrackingAuthorization: (status: TrackingAuthorization) => {
			trackingStatus = status;
			tracking.fallback = { status };
		},
		snapshot: () => snapshot,
		tracking,
	};
};
