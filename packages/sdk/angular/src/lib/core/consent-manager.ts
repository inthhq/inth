import { isPlatformBrowser } from '@angular/common';
import {
	afterNextRender,
	ApplicationRef,
	computed,
	CSP_NONCE,
	DestroyRef,
	effect,
	ErrorHandler,
	inject,
	Injectable,
	InjectionToken,
	PendingTasks,
	PLATFORM_ID,
	signal,
	TransferState,
	untracked,
} from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import type {
	ActiveUI,
	AllConsentNames,
	ConsentKernel,
	ConsentPresentation,
	ConsentSnapshot,
	ConsentState,
	ConsentType,
	ExperimentAssignment,
	HasCondition,
	KernelActiveUI,
	KernelIABState,
	Model,
	OptOutResult,
	ResolvedVendor,
	SaveUISource,
} from '@inth/sdk/engine';
import type { IABHandle } from '@inth/sdk/iab';
import type {
	createPreferenceDraft,
	PreferenceDraft,
	PreferenceDraftState,
} from '@inth/sdk/preference-draft';
import type { ConsentRuntime } from '@inth/sdk/runtime/provider';
import {
	getOptOutReceiptData,
	getServerOptOutReceiptData,
	hasConsentPreferences,
	hasConsentUI,
	hasOptOutConfirmationHost,
	isOptOutConfirmationOpen,
	isSnapshotVendorAllowed,
	optOutConsentSurface,
	saveConsentSurface,
	saveConsentSurfaceWithOptInCheck,
	showConsentSurface,
	subscribeOptOutConfirmation,
	subscribeOptOutReceiptData,
} from '@inth/sdk/surface-actions';
import {
	allConsentNames,
	applyExperimentAssignment,
	applyExperimentTheme,
	consentTypes as defaultConsentTypes,
	has as evaluateHas,
	hasGlobalPrivacyControlSignal,
	IABUnavailableError,
	iabSurfaceActions,
	pendingBootSnapshot,
	policyNeedsIAB,
	resolveOptOut,
	resolveSurfaceTranslations,
	vendorsListedUnder,
} from '@inth/sdk/surface-state';
import type { OptOutReceiptData, OptOutState } from '@inth/sdk/surface-state';
import type { CompleteTranslations } from '@inth/sdk/translations';
import type { Theme } from '@inth/sdk/ui/theme';

import { BOOT_STATE_KEY, restoreBoot } from './deferred/boot';
import type { ConsentBoot } from './deferred/boot';
import { createDeferredRuntime } from './deferred/deferred-runtime';
import type {
	DeferredRuntime,
	EngineFactory,
} from './deferred/deferred-runtime';
import type * as EngineModule from './deferred/engine';
import { isIABConfigured } from './iab-loader';
import { INTH_OPTIONS, runtimeOptionsFor } from './options';
import type { InthResolvedOptions, InthSharedOptions } from './options';
import { SERVER_STATE_KEY, SERVER_STATE_GATE } from './server-state';

/**
 * Loads the consent engine's chunk. Provide another to test a failed load.
 *
 * @internal
 */
export const CONSENT_ENGINE_MODULE = new InjectionToken<
	() => Promise<typeof EngineModule>
>('INTH_CONSENT_ENGINE_MODULE', {
	factory: () => () => import('./deferred/engine'),
});

/** How long after a failed draft import its readers try again, doubling. */
const DRAFT_RETRY_MS = 1000;
const DRAFT_RETRY_MAX_MS = 30_000;

/** What `saveConsents` records. */
export type SaveType = 'all' | 'custom' | 'necessary';

/**
 * The IAB TCF state the surfaces render: the kernel's IAB slice with the
 * actions of the lazily loaded CMP handle.
 *
 * The actions are safe to call before `@inth/sdk/iab` has loaded: the lazy
 * handle queues them and replays them once it lands.
 */
export interface AngularIABState extends KernelIABState {
	config: {
		enabled: boolean;
		cmpId: number | null;
	};
	isLoadingGVL: boolean;
	nonIABVendors: KernelIABState['customVendors'];
	preferenceCenterTab: 'purposes' | 'vendors';
	setPreferenceCenterTab: (tab: 'purposes' | 'vendors') => void;
	setVendorConsent: (vendorId: string | number, value: boolean) => void;
	setVendorLegitimateInterest: (
		vendorId: string | number,
		value: boolean
	) => void;
	setPurposeConsent: (purposeId: number, value: boolean) => void;
	setPurposeLegitimateInterest: (purposeId: number, value: boolean) => void;
	/** Object to a purpose's legitimate interest, for it and its vendors. */
	setPurposeObjection: (purposeId: number, objected: boolean) => void;
	setSpecialFeatureOptIn: (featureId: number, value: boolean) => void;
	/** Set consent for a Google ad tech provider (Additional Consent). */
	setAdTechProviderConsent: (providerId: number, value: boolean) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	save: () => Promise<void>;
}

/**
 * The preference draft: the choices a preference surface stages before
 * they are saved.
 *
 * `@inth/sdk/preference-draft` is not part of the first load. The first
 * read of `values`, `vendors` or `isStale` in the browser loads it; until it
 * lands they read empty and `false`, and writes wait in order for it.
 */
export interface ConsentDraftState {
	/** Staged value per category. */
	readonly values: Signal<Partial<ConsentState>>;
	/**
	 * Granted flag per declared vendor. Seeded from the denials the gate
	 * honors; every vendor not denied is `true`. Empty under an `iab` policy.
	 */
	readonly vendors: Signal<Readonly<Record<string, boolean>>>;
	/** Whether the policy changed since the draft was seeded. */
	readonly isStale: Signal<boolean>;
	/**
	 * Stage one category.
	 *
	 * @param value - Whether it is granted once the draft is saved.
	 */
	set: (name: AllConsentNames, value: boolean) => void;
	/**
	 * Stage one vendor's grant. Ignored for a vendor that is not declared or
	 * is declared `disabled`.
	 *
	 * @param vendorId - Vendor slug as declared in `vendors` or on a script.
	 * @param granted - Whether the vendor may load once the draft is saved.
	 */
	setVendor: (vendorId: string, granted: boolean) => void;
	/** Drop every staged edit. */
	reset: () => void;
	/**
	 * Record the staged choices.
	 *
	 * @param categories - The categories the surface displays.
	 * @throws {Error} When the draft is stale or the save fails.
	 */
	save: (categories: readonly AllConsentNames[]) => Promise<void>;
}

/** Metadata for the displayed categories, in the draft's order. */
const displayedConsentTypes = function displayedConsentTypes(
	categories: readonly AllConsentNames[]
): ConsentType[] {
	const names =
		categories.length > 0
			? categories
			: (allConsentNames as readonly AllConsentNames[]);
	return names.flatMap((name) =>
		defaultConsentTypes
			.filter((type) => type.name === name)
			.map((type) => ({ ...type, display: true }))
	);
};

const EMPTY: Readonly<Record<string, boolean>> = Object.freeze({});

const noop = () => {
	/* nothing to stop yet */
};

/**
 * The consent state of the application, as signals, and the verbs that
 * change it.
 *
 * Provided by `provideInth()`. Every readable field is a `Signal`, so it
 * works in templates, `computed()` and `effect()`; every verb is a method.
 * It projects the Inth consent kernel: it subscribes to the kernel and
 * writes each snapshot to {@link ConsentManager.snapshot}.
 *
 * The consent engine is a chunk of its own. Until it loads, the manager
 * renders the snapshot the server rendered with (or a pending one without
 * a server render), and a banner tap is recorded without it. It starts
 * (storage, `/v1/consent/init`, script loading, IAB) only in the browser, after the
 * first render, so hydration sees the state the server rendered with; for
 * a visitor the server's state lets wait, after the page's priority
 * images (`deferred/trigger.ts`).
 *
 * @example
 * ```ts
 * @Component({
 *   selector: 'app-analytics-status',
 *   changeDetection: ChangeDetectionStrategy.OnPush,
 *   template: `@if (measurement()) { Analytics on } @else { Analytics off }`,
 * })
 * export class AnalyticsStatus {
 *   readonly #consent = inject(ConsentManager);
 *   protected readonly measurement = computed(() =>
 *     this.#consent.has('measurement')
 *   );
 * }
 * ```
 */
@Injectable()
export class ConsentManager {
	readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
	readonly #options = signal<InthResolvedOptions>({});
	readonly #owned: DeferredRuntime | undefined;
	readonly #kernel: WritableSignal<ConsentKernel>;
	readonly #snapshot: WritableSignal<ConsentSnapshot>;
	readonly #iabHandle = signal<IABHandle | null>(null);
	readonly #iabTab = signal<'purposes' | 'vendors'>('purposes');
	readonly #draftState = signal<PreferenceDraftState | null>(null);

	#createDraft: typeof createPreferenceDraft | null = null;
	#preferenceDraft: PreferenceDraft | null = null;
	#stopDraft: () => void = noop;
	#waiting: ((draft: PreferenceDraft) => void)[] = [];
	#draftLoad: Promise<PreferenceDraft> | undefined;
	/**
	 * Bumped a while after a failed draft import: the draft's computeds read
	 * it, so their next read imports again. The wait doubles with each
	 * failure, so a template that keeps reading does not retry in a loop.
	 */
	readonly #draftRetry = signal(0);
	#draftFailures = 0;
	#unsubscribeKernel: () => void = noop;
	#unsubscribeOptOutConfirmation: () => void = noop;
	#unsubscribeOptOutReceiptData: () => void = noop;
	readonly #optOutConfirmationOpen = signal(false);
	readonly #hasStandaloneOptOutConfirmation = signal(false);
	/**
	 * Whether the receipt data is this browser's local data. Until the
	 * application is stable, which is after hydration, it is the server's
	 * value, so a server-rendered receipt or rights bundle hydrates as the
	 * server rendered it; the server never switches.
	 */
	#receiptDataLive = false;
	readonly #optOutReceiptData = signal<Readonly<OptOutReceiptData>>({
		localAct: null,
		reference: null,
		rightsConfirmed: false,
	});
	readonly #consentListeners = new Set<(state: ConsentState) => void>();
	#noBootPrefetch = false;

	/** The runtime this manager renders, owned or handed in. */
	readonly runtime: ConsentRuntime;

	/**
	 * The options the provider was given, minus `runtime`, as changed by
	 * {@link ConsentManager.updateOptions}.
	 */
	readonly options: Signal<InthResolvedOptions> = this.#options.asReadonly();

	/**
	 * The rendered kernel. An owned runtime swaps it when `enabled` toggles.
	 */
	readonly kernel: Signal<ConsentKernel>;

	readonly snapshot: Signal<ConsentSnapshot>;

	/** Which consent surface is open. */
	readonly activeUI: Signal<ActiveUI>;
	/** Attribution the surfaces show. */
	readonly branding: Signal<ConsentSnapshot['branding']>;
	/** The draft's displayed categories: `necessary` plus the choice scope. */
	readonly consentCategories: Signal<AllConsentNames[]>;
	/** Metadata for {@link ConsentManager.consentCategories}. */
	readonly consentTypes: Signal<ConsentType[]>;
	/** The configured presentation with the assigned experiment arm merged over it. */
	readonly presentation: Signal<ConsentPresentation | undefined>;
	/** The presentation experiment arm this visitor runs, or `null`. */
	readonly experiment: Signal<Readonly<ExperimentAssignment> | null>;
	/** The configured theme with the assigned experiment arm's theme merged over it. */
	readonly theme: Signal<Theme | undefined>;
	/** `'iab'` under an IAB policy, else the policy rule's model. */
	readonly model: Signal<Model>;
	/**
	 * Whether a policy rule is resolved for this visitor. Every Inth surface
	 * renders nothing until one is.
	 */
	readonly hasPolicy: Signal<boolean>;
	/**
	 * Whether the resolved rule owes any consent UI. `false` until a rule is
	 * resolved.
	 */
	readonly hasConsentUi: Signal<boolean>;
	/** Whether Inth or an external CMP offers a preferences control. */
	readonly hasConsentPreferences: Signal<boolean>;
	/** The provider's `legalLinks` option. */
	readonly legalLinks: Signal<InthSharedOptions['legalLinks']>;
	/**
	 * The copy the surfaces render: the active language bundle with English
	 * filling every key it leaves out.
	 */
	readonly copy: Signal<CompleteTranslations>;
	/** The IAB TCF state, or `null` without IAB. */
	readonly iab: Signal<AngularIABState | null>;
	/**
	 * Whether the resolved policy needs IAB TCF and `iab` is not configured.
	 * The provider reports an `IABUnavailableError` to the `ErrorHandler`
	 * when this turns `true`.
	 */
	readonly iabUnavailable: Signal<boolean>;
	readonly draft: ConsentDraftState;
	/** Staged values of the draft. Same as `draft.values`. */
	readonly selectedConsents: Signal<Partial<ConsentState>>;
	/** Staged values of the draft. Same as `draft.values`. */
	readonly selectedConsentTypes: Signal<Partial<ConsentState>>;
	/** Granted flag per declared vendor in the draft. */
	readonly selectedVendors: Signal<Readonly<Record<string, boolean>>>;

	/** The visitor's recorded choice. */
	readonly explicitChoice: Signal<ConsentSnapshot['explicitChoice']>;
	/** What each category is allowed to do now. */
	readonly effectivePermissions: Signal<
		ConsentSnapshot['effectivePermissions']
	>;
	/** What the policy asks of the visitor. */
	readonly promptRequirement: Signal<ConsentSnapshot['promptRequirement']>;
	/** The notice dismissal record. */
	readonly noticeDismissal: Signal<ConsentSnapshot['noticeDismissal']>;
	/** The durable opt-out record, or `null`. */
	readonly optOut: Signal<ConsentSnapshot['optOut']>;
	/** Merged opt-out display state and receipt derived from the current snapshot and local receipt data. */
	readonly optOutState: Signal<OptOutState>;
	/** Whether the opt-out confirmation view is currently open. */
	readonly optOutConfirmationOpen: Signal<boolean> =
		this.#optOutConfirmationOpen.asReadonly();
	/**
	 * Whether a standalone `<inth-opt-out-confirmation>` host is mounted.
	 *
	 * @internal
	 */
	readonly ɵhasStandaloneOptOutConfirmation: Signal<boolean> =
		this.#hasStandaloneOptOutConfirmation.asReadonly();
	/**
	 * This browser's local opt-out receipt data, which says whether a
	 * backend answer confirmed the held record's rights.
	 *
	 * @internal
	 */
	readonly ɵoptOutReceiptData: Signal<Readonly<OptOutReceiptData>> =
		this.#optOutReceiptData.asReadonly();
	/** GPC and other privacy signals. */
	readonly privacySignals: Signal<ConsentSnapshot['privacySignals']>;
	/** How the policy was resolved. */
	readonly resolution: Signal<ConsentSnapshot['resolution']>;
	readonly policyRule: Signal<ConsentSnapshot['policyRule']>;
	/** Restrictions the policy applies. */
	readonly restrictions: Signal<ConsentSnapshot['restrictions']>;
	/** When the state next changes on its own. */
	readonly nextDeadline: Signal<ConsentSnapshot['nextDeadline']>;
	readonly subject: Signal<ConsentSnapshot['subject']>;
	/** The clock the snapshot was evaluated at. */
	readonly evaluatedAt: Signal<ConsentSnapshot['evaluatedAt']>;
	/** The evaluation policy. */
	readonly evaluationPolicy: Signal<ConsentSnapshot['evaluationPolicy']>;
	/** Whether a policy is still being resolved. */
	readonly policyPending: Signal<ConsentSnapshot['policyPending']>;
	/** The visitor's resolved location. */
	readonly location: Signal<ConsentSnapshot['location']>;
	/** Overrides in effect. */
	readonly overrides: Signal<ConsentSnapshot['overrides']>;
	readonly revision: Signal<ConsentSnapshot['revision']>;
	readonly translations: Signal<ConsentSnapshot['translations']>;
	readonly user: Signal<ConsentSnapshot['user']>;
	readonly vendors: Signal<ConsentSnapshot['vendors']>;
	/** The visitor's vendor choices. */
	readonly vendorChoice: Signal<ConsentSnapshot['vendorChoice']>;

	constructor() {
		const destroyRef = inject(DestroyRef);
		const errorHandler = inject(ErrorHandler);
		if (this.#browser) {
			// The first render is the one that hydrates; parts it loads, such
			// as a lazy prompt, hold the application unstable until they are in.
			let destroyed = false;
			destroyRef.onDestroy(() => {
				destroyed = true;
			});
			const appRef = inject(ApplicationRef);
			afterNextRender(() => {
				// oxlint-disable-next-line promise/prefer-await-to-then -- Fire and forget from a render hook.
				void appRef.whenStable().then(() => {
					if (destroyed) {
						return;
					}
					this.#receiptDataLive = true;
					this.#optOutReceiptData.set(
						getOptOutReceiptData(untracked(this.#kernel))
					);
				});
			});
		}
		const { runtime: external, ...given } = inject(INTH_OPTIONS);
		// What `provideInthServer()` resolved for this request: set on the
		// server before the render, read back in the browser, so both start
		// from it. A `prefetch` the app passed wins.
		const transferState = inject(TransferState);
		const serverState = transferState.get(SERVER_STATE_KEY, null);
		// Scripts the loader adds carry Angular's `CSP_NONCE` unless the app
		// set `nonce` itself, as the injected `<style>` elements do.
		const cspNonce = inject(CSP_NONCE, { optional: true });
		const withPrefetch =
			serverState && given.prefetch === undefined
				? { ...given, prefetch: serverState }
				: given;
		const options =
			cspNonce && withPrefetch.nonce === undefined
				? { ...withPrefetch, nonce: cspNonce }
				: withPrefetch;
		this.#options.set(options);

		this.#owned =
			external === undefined
				? this.#createDeferred(options, transferState)
				: undefined;
		const runtime = (external ?? this.#owned) as ConsentRuntime;
		this.runtime = runtime;
		if (external && options.consentCategories) {
			external.setConsentCategories(options.consentCategories);
		}

		this.#kernel = signal(runtime.kernel);
		this.#snapshot = signal(runtime.kernel.getSnapshot());
		this.#iabHandle.set(runtime.iab as IABHandle | null);
		this.kernel = this.#kernel.asReadonly();
		this.snapshot = this.#snapshot.asReadonly();

		const snapshot = this.#snapshot;
		const field = <Key extends keyof ConsentSnapshot>(key: Key) =>
			computed(() => snapshot()[key]);

		this.activeUI = computed(() => (snapshot().activeUI ?? 'none') as ActiveUI);
		this.branding = computed(() => snapshot().branding);
		// The draft's displayed categories, without loading the draft: the
		// runtime applies the same display-order rule. Reading the snapshot
		// recomputes it when the policy changes.
		this.consentCategories = computed(() => {
			snapshot();
			return runtime.consentCategories;
		});
		this.consentTypes = computed(() =>
			displayedConsentTypes(this.consentCategories())
		);
		// The runtime validated and assigned from the experiment it was
		// created with, so presentation, theme and draft defaults resolve
		// against that same definition. The engine's runtime replaces the
		// boot's when it attaches, which the snapshot announces.
		this.presentation = computed(() =>
			applyExperimentAssignment(
				this.#options().presentation,
				runtime.experiment,
				snapshot().experiment
			)
		);
		this.experiment = computed(() => snapshot().experiment);
		this.theme = computed(() =>
			applyExperimentTheme(
				this.#options().theme,
				runtime.experiment,
				snapshot().experiment
			)
		);
		// The policy decides, not the IAB module: an app with IAB configured
		// for some regions keeps its standard surfaces everywhere else.
		this.model = computed(() => snapshot().policyRule.model);
		this.hasPolicy = computed(() => snapshot().resolution.status === 'matched');
		this.hasConsentUi = computed(() => hasConsentUI(snapshot()));
		this.hasConsentPreferences = computed(() =>
			hasConsentPreferences(snapshot())
		);
		this.legalLinks = computed(() => this.#options().legalLinks);
		this.copy = computed(() => resolveSurfaceTranslations(snapshot()));
		this.iab = computed(() => this.#projectIAB());
		this.iabUnavailable = computed(
			() =>
				this.#owned !== undefined &&
				!isIABConfigured(this.#options().iab) &&
				policyNeedsIAB(snapshot())
		);

		this.draft = this.#createDraftState();
		this.selectedConsents = this.draft.values;
		this.selectedConsentTypes = this.draft.values;
		this.selectedVendors = this.draft.vendors;

		this.explicitChoice = field('explicitChoice');
		this.effectivePermissions = field('effectivePermissions');
		this.promptRequirement = field('promptRequirement');
		this.noticeDismissal = field('noticeDismissal');
		this.optOut = field('optOut');
		this.privacySignals = field('privacySignals');
		this.resolution = field('resolution');
		this.policyRule = field('policyRule');
		this.restrictions = field('restrictions');
		this.nextDeadline = field('nextDeadline');
		this.subject = field('subject');
		this.evaluatedAt = field('evaluatedAt');
		this.evaluationPolicy = field('evaluationPolicy');
		this.optOutState = computed(() =>
			resolveOptOut(
				{
					evaluationPolicy: this.evaluationPolicy(),
					optOut: this.optOut(),
					privacySignals: this.privacySignals(),
				},
				this.#optOutReceiptData()
			)
		);
		this.policyPending = field('policyPending');
		this.location = field('location');
		this.overrides = field('overrides');
		this.revision = field('revision');
		this.translations = field('translations');
		this.user = field('user');
		this.vendors = field('vendors');
		this.vendorChoice = field('vendorChoice');

		this.#follow(runtime.kernel);

		const engine = signal<ConsentKernel | null>(
			this.#owned ? null : runtime.kernel
		);
		const engineSettled = signal(!this.#owned);
		this.ɵengine = engine.asReadonly();
		this.ɵengineSettled = engineSettled.asReadonly();
		// oxlint-disable-next-line promise/prefer-await-to-then -- `ready` never rejects.
		void this.#owned?.ready.then(() => engineSettled.set(true));
		const unsubscribeRuntime = runtime.subscribe(() => {
			// The engine attached, on its first load or a retry.
			const attached = this.#owned?.engineKernel();
			if (attached && attached !== untracked(engine)) {
				engine.set(attached);
			}
			// The lazy handle queues calls until `@inth/sdk/iab` lands and replays
			// them, so the surfaces render against it as soon as it exists.
			this.#iabHandle.set(runtime.iab as IABHandle | null);
			// Turning `enabled` off swaps in a permissive kernel, in an owned
			// runtime or one its owner passed in; follow it.
			const { kernel } = runtime;
			if (kernel === untracked(this.#kernel)) {
				return;
			}
			this.#follow(kernel);
			if (this.#createDraft) {
				this.#startDraft(kernel);
			}
		});
		const owned = this.#owned;

		// Presentation defaults of the arm this visitor runs.
		effect(() => {
			const defaults = applyExperimentAssignment(
				this.#options().presentation,
				runtime.experiment,
				snapshot().experiment
			)?.preferences?.defaults;
			untracked(() => this.#preferenceDraft?.setDefaults(defaults));
		});

		// IAB is opt-in. Without `iab` no CMP answers for an `iab` policy, and
		// the standard banner does not handle it, so the visitor would get no
		// consent UI. A borrowed runtime's owner configures IAB.
		effect(() => {
			if (this.iabUnavailable()) {
				errorHandler.handleError(
					new IABUnavailableError(
						'`iab` is not set',
						'Set `iab` in provideInth() and render <inth-iab-consent-banner>'
					)
				);
			}
		});

		if (owned && this.#browser) {
			// After the first render, so hydration matches the server's HTML.
			afterNextRender(() => {
				owned.start();
				this.#snapshot.set(untracked(this.#kernel).getSnapshot());
			});
		}

		destroyRef.onDestroy(() => {
			// Drop the runtime listener first: disposing the runtime emits a
			// final `null` IAB handle and this service is already tearing down.
			unsubscribeRuntime();
			this.#unsubscribeKernel();
			this.#unsubscribeOptOutConfirmation();
			this.#unsubscribeOptOutReceiptData();
			this.#stopDraft();
			owned?.dispose();
		});
	}

	/**
	 * Change the provider's options after bootstrap.
	 *
	 * The given fields are merged over the current options. An owned runtime
	 * compares the result with the last options and applies only what
	 * changed, so a theme-only change asks the backend nothing. With an
	 * external runtime only `consentCategories` reaches the runtime.
	 *
	 * @param patch - The options to change. `mode` is read once and ignored.
	 * @returns Resolves once the runtime applied the change.
	 */
	updateOptions(patch: Partial<InthSharedOptions>): Promise<void> {
		const next = { ...this.#options(), ...patch };
		this.#options.set(next);
		if (this.#owned) {
			// It rejects when its chunk fails to load. Requests held for new
			// rules have failed closed by then, and the next update loads it.
			return this.#owned.update(runtimeOptionsFor(next)).catch(() => undefined);
		}
		// Present, not truthy: `undefined` restores the policy's categories.
		if ('consentCategories' in patch) {
			this.runtime.setConsentCategories(patch.consentCategories);
		}
		return Promise.resolve();
	}

	/**
	 * Metadata for the categories the preference surfaces display.
	 *
	 * @returns One entry per displayed category, in order.
	 */
	getDisplayedConsents(): ConsentType[] {
		return this.consentTypes();
	}

	/**
	 * The vendors listed under one category: presentable, naming that
	 * category, without a negation. Empty under an `iab` policy.
	 *
	 * @param category - The category row being rendered.
	 * @returns The vendors to list, in declared order.
	 */
	getDisplayedVendors(category: AllConsentNames): ResolvedVendor[] {
		return vendorsListedUnder(this.#snapshot(), category);
	}

	/**
	 * Whether a consent condition holds now. Reads the snapshot signal, so
	 * it updates templates and `computed()`s that call it.
	 *
	 * @param condition - A category name or a boolean combination of them.
	 * @returns `true` while the condition holds.
	 */
	has(condition: HasCondition<AllConsentNames>): boolean {
		return evaluateHas(
			condition,
			this.#snapshot().effectivePermissions as ConsentState
		);
	}

	/**
	 * Whether one vendor may load: it is declared, its category condition
	 * passes, and outside IAB the visitor has not turned it off.
	 *
	 * @param vendorId - Vendor id as declared in `vendors`, on a script or by
	 * the backend.
	 * @returns `true` while the vendor may load. An id nothing declares
	 * returns `false` and logs a development warning.
	 */
	isVendorAllowed(vendorId: string): boolean {
		return isSnapshotVendorAllowed(this.#snapshot(), vendorId);
	}

	/**
	 * Record that the visitor dismissed a notice.
	 *
	 * @param context - `actionAt`: when the visitor dismissed it, such as a
	 * tap made before the app hydrated. Defaults to now.
	 */
	dismissNotice(context?: { actionAt?: number }): Promise<unknown> {
		return untracked(this.#kernel).commands.dismissNotice(context);
	}

	/**
	 * Record an opt-out in one click and open `<inth-opt-out-confirmation>`
	 * under an opt-out policy. Under other policy models, open the preference
	 * dialog.
	 */
	requestOptOut(context?: { uiSource?: SaveUISource }): Promise<OptOutResult> {
		return optOutConsentSurface(untracked(this.#kernel), context);
	}

	/**
	 * Record a choice and close the surface.
	 *
	 * `'all'` grants and `'necessary'` denies every category in the choice
	 * scope; `'custom'` records the draft. The surface closes in this task
	 * once the kernel has recorded the choice.
	 *
	 * @throws {Error} When the save fails, or a custom save finds the draft
	 * stale.
	 */
	async saveConsents(type: SaveType): Promise<void> {
		// The kernel this action started on, even if `enabled` swaps it.
		const kernel = untracked(this.#kernel);
		const { draft } = this;
		const categories = untracked(this.consentCategories);
		if (type === 'custom') {
			const result = await saveConsentSurface(kernel, async () => {
				await draft.save(categories);
				return { ok: true };
			});
			if (!result.ok) {
				throw new Error('Unable to save preferences.');
			}
			return;
		}
		const input = type === 'all' ? 'all' : 'none';
		const preferenceDraft = this.#preferenceDraft;
		const result = preferenceDraft
			? await saveConsentSurface(kernel, () => preferenceDraft.save({ input }))
			: await saveConsentSurfaceWithOptInCheck(
					kernel,
					input,
					() => {
						// No category list: the kernel narrows a bulk choice to its own
						// choice scope, the categories the draft displays.
						const pending = kernel.commands.save(input);
						// A bulk choice supersedes every staged edit.
						draft.reset();
						return pending;
					},
					{ categories }
				);
		if (!result.ok) {
			throw new Error('Unable to save preferences.');
		}
	}

	/**
	 * Open or close a consent surface.
	 */
	setActiveUI(ui: ActiveUI): void {
		showConsentSurface(untracked(this.#kernel), ui as KernelActiveUI);
	}

	/**
	 * Stage one category on the draft. Same as `draft.set`.
	 *
	 * @param value - Whether it is granted once the draft is saved.
	 */
	setConsent(name: AllConsentNames, value: boolean): void {
		this.draft.set(name, value);
	}

	/**
	 * Stage one category on the draft. Same as `draft.set`.
	 *
	 * @param value - Whether it is granted once the draft is saved.
	 */
	setSelectedConsent(name: AllConsentNames, value: boolean): void {
		this.draft.set(name, value);
	}

	/**
	 * Stage one vendor's grant on the draft. Recorded by the next save.
	 *
	 * @param vendorId - Vendor slug as declared in `vendors` or on a script.
	 * @param granted - Whether the vendor may load once the draft is saved.
	 */
	setSelectedVendor(vendorId: string, granted: boolean): void {
		this.draft.setVendor(vendorId, granted);
	}

	/**
	 * Show the consent copy in another language.
	 */
	setLanguage(code: string): void {
		this.runtime.setLanguage(code);
	}

	/** Clear receipts, identity and persisted records. */
	clearRecords(): void {
		this.runtime.clearRecords();
	}

	/**
	 * Listen to the effective permissions changing. Prefer reading
	 * {@link ConsentManager.effectivePermissions} in an `effect()`; this is
	 * for code outside Angular's reactivity.
	 *
	 * @param listener - Called with the permissions after each change.
	 * @returns Stops listening.
	 */
	subscribeToConsentChanges(
		listener: (state: ConsentState) => void
	): () => void {
		// Held here, not on the kernel, so it hears the kernel `enabled`
		// swaps to.
		const entry = (state: ConsentState) => listener(state);
		this.#consentListeners.add(entry);
		return () => {
			this.#consentListeners.delete(entry);
		};
	}

	/**
	 * Start the draft with the draft module a preference surface imported, so
	 * it renders seeded values in its first render.
	 *
	 * @param create - `createPreferenceDraft` from `@inth/sdk/preference-draft`.
	 * @internal
	 */
	provideDraft(create: typeof createPreferenceDraft): PreferenceDraft {
		if (this.#preferenceDraft) {
			return this.#preferenceDraft;
		}
		this.#createDraft = create;
		const started = this.#startDraft(untracked(this.#kernel));
		for (const apply of this.#waiting.splice(0)) {
			apply(started);
		}
		return started;
	}

	/**
	 * The runtime the provider owns: a deferred runtime over the boot the
	 * server rendered with, or over a pending snapshot when there is none.
	 * The engine loads in a chunk of its own. In the browser `start()`
	 * decides when; on the server it loads at once and the render waits.
	 */
	#createDeferred(
		options: InthResolvedOptions,
		transferState: TransferState
	): DeferredRuntime {
		const read = () => untracked(this.#options);
		const importEngine = inject(CONSENT_ENGINE_MODULE);
		const gate = this.#browser
			? null
			: inject(SERVER_STATE_GATE, { optional: true });
		const loadEngine = async (): Promise<EngineFactory> => {
			const engine = await importEngine();
			if (gate) {
				// Built before `provideInthServer()` set the request's state:
				// the engine starts from it once it is there.
				await gate.ready;
				const serverState = transferState.get(SERVER_STATE_KEY, null);
				if (serverState && read().prefetch === undefined) {
					this.#options.update((current) => ({
						...current,
						prefetch: serverState,
					}));
				}
			}
			return (committed) => ({
				preloadSavePath: engine.preloadSavePath,
				runtime: engine.createEngine(runtimeOptionsFor(read()), committed),
				updateOptions: (next) => next,
			});
		};
		const stored = this.#browser
			? transferState.get(BOOT_STATE_KEY, null)
			: null;
		const boot: ConsentBoot = stored
			? restoreBoot(stored, options.prefetch?.initialIab?.gvl)
			: {
					s: pendingBootSnapshot({
						consentCategories: options.consentCategories,
						gpc: this.#browser && hasGlobalPrivacyControlSignal(),
						overrides: options.overrides,
					}),
				};
		const deferred = createDeferredRuntime({ boot, loadEngine, options: read });
		if (!this.#browser) {
			this.#renderWithEngine(deferred, transferState);
		} else if (!stored) {
			// No server render to hydrate: nothing waits for the page, so the
			// engine's chunk downloads while the app renders. It starts after
			// the first render, and the app is not stable before it is in.
			this.#noBootPrefetch = options.prefetch !== undefined;
			deferred.load();
			const done = inject(PendingTasks).add();
			inject(DestroyRef).onDestroy(done);
			// oxlint-disable-next-line promise/prefer-await-to-then -- Settles the task; `ready` never rejects.
			void deferred.ready.finally(done);
		}
		return deferred;
	}

	/**
	 * Server only: loads the engine before the render settles, so the HTML
	 * comes from its snapshot, and leaves that snapshot for the browser.
	 */
	#renderWithEngine(
		deferred: DeferredRuntime,
		transferState: TransferState
	): void {
		deferred.load();
		void inject(PendingTasks).run(async () => {
			const runtime = await deferred.ready;
			if (!runtime) {
				return;
			}
			const { planServerBoot } = await import('./deferred/boot-server');
			// The options the engine started from, with the request's state.
			transferState.set(
				BOOT_STATE_KEY,
				planServerBoot(runtime, untracked(this.#options))
			);
		});
	}

	/**
	 * The consent engine's own kernel, once it has attached: modules such as
	 * the script loader register with it. A first load or a later retry sets
	 * it. An external runtime's kernel is its engine.
	 *
	 * @internal
	 */
	readonly ɵengine: Signal<ConsentKernel | null>;

	/**
	 * Whether the first engine load has settled, attached or failed.
	 *
	 * @internal
	 */
	readonly ɵengineSettled: Signal<boolean>;

	/**
	 * Whether bootstrap waits for the engine: a page with no server render
	 * whose options carry a `prefetch` the first render should show.
	 *
	 * @returns `true` for such a page.
	 * @internal
	 */
	ɵwaitsForEngine(): boolean {
		return this.#noBootPrefetch;
	}

	/**
	 * Start loading the preference draft's code, as a preference surface
	 * about to render does.
	 *
	 * @internal
	 */
	preloadDraft(): void {
		this.#requestDraft();
	}

	#follow(kernel: ConsentKernel): void {
		this.#unsubscribeKernel();
		this.#unsubscribeOptOutConfirmation();
		this.#unsubscribeOptOutReceiptData();
		this.#kernel.set(kernel);
		const syncConfirmation = () => {
			this.#optOutConfirmationOpen.set(isOptOutConfirmationOpen(kernel));
			this.#hasStandaloneOptOutConfirmation.set(
				hasOptOutConfirmationHost(kernel)
			);
		};
		syncConfirmation();
		this.#unsubscribeOptOutConfirmation = subscribeOptOutConfirmation(
			kernel,
			syncConfirmation
		);
		const readReceiptData = () =>
			this.#receiptDataLive
				? getOptOutReceiptData(kernel)
				: getServerOptOutReceiptData(kernel);
		this.#optOutReceiptData.set(readReceiptData());
		this.#unsubscribeOptOutReceiptData = subscribeOptOutReceiptData(
			kernel,
			() => {
				this.#optOutReceiptData.set(readReceiptData());
			}
		);
		const emit = (snapshot: ConsentSnapshot) => {
			this.#snapshot.set(snapshot);
			for (const listener of [...this.#consentListeners]) {
				listener(snapshot.effectivePermissions as ConsentState);
			}
		};
		emit(kernel.getSnapshot());
		this.#unsubscribeKernel = kernel.subscribe(emit);
	}

	#startDraft(kernel: ConsentKernel): PreferenceDraft {
		this.#stopDraft();
		const create = this.#createDraft as typeof createPreferenceDraft;
		const defaults = untracked(this.presentation)?.preferences?.defaults;
		const started = create(kernel, { defaults });
		this.#preferenceDraft = started;
		this.#draftState.set(started.getState());
		this.#stopDraft = started.subscribe(() => {
			this.#draftState.set(started.getState());
		});
		return started;
	}

	async #importDraft(): Promise<PreferenceDraft> {
		try {
			const module = await import('@inth/sdk/preference-draft');
			return this.provideDraft(module.createPreferenceDraft);
		} catch (error) {
			// The next read or write retries.
			this.#draftLoad = undefined;
			throw error;
		}
	}

	#loadDraft(): Promise<PreferenceDraft> {
		if (this.#preferenceDraft) {
			return Promise.resolve(this.#preferenceDraft);
		}
		this.#draftLoad ??= this.#importDraft();
		return this.#draftLoad;
	}

	/** Load the draft for a read; the read is a signal and fills in. */
	#requestDraft(): void {
		if (this.#preferenceDraft || !this.#browser) {
			return;
		}
		void this.#loadDraftForRead();
	}

	/** Loads the draft for a read; a failure schedules the readers' retry. */
	async #loadDraftForRead(): Promise<void> {
		try {
			await this.#loadDraft();
			this.#draftFailures = 0;
		} catch {
			this.#draftFailures += 1;
			const wait = Math.min(
				DRAFT_RETRY_MS * 2 ** (this.#draftFailures - 1),
				DRAFT_RETRY_MAX_MS
			);
			setTimeout(() => {
				this.#draftRetry.update((count) => count + 1);
			}, wait);
		}
	}

	#withDraft(apply: (draft: PreferenceDraft) => void): void {
		if (this.#preferenceDraft) {
			apply(this.#preferenceDraft);
			return;
		}
		this.#waiting.push(apply);
		this.#requestDraft();
	}

	#createDraftState(): ConsentDraftState {
		const state = this.#draftState;
		return {
			isStale: computed(() => {
				this.#draftRetry();
				this.#requestDraft();
				return state()?.isStale ?? false;
			}),
			reset: () => {
				// Nothing is staged before the draft exists but the waiting writes.
				this.#waiting = [];
				this.#preferenceDraft?.reset();
			},
			save: async (categories) => {
				// A loaded draft records in this task, so the surface closes in
				// the click task.
				const current = this.#preferenceDraft ?? (await this.#loadDraft());
				if (current.getState().isStale) {
					throw new Error(
						'The policy changed. Review your preferences before saving.'
					);
				}
				const result = await current.save({ categories });
				if (!result.ok) {
					throw new Error('Unable to save preferences.');
				}
			},
			set: (name, value) => {
				this.#withDraft((current) => current.set(name, value));
			},
			setVendor: (vendorId, granted) => {
				this.#withDraft((current) => current.setVendor(vendorId, granted));
			},
			values: computed(() => {
				this.#draftRetry();
				this.#requestDraft();
				return state()?.values ?? EMPTY;
			}),
			vendors: computed(() => {
				this.#draftRetry();
				this.#requestDraft();
				return state()?.vendors ?? EMPTY;
			}),
		};
	}

	#projectIAB(): AngularIABState | null {
		const { iab } = this.#snapshot();
		if (!iab) {
			return null;
		}
		// Rendering keys on the kernel state so a server-resolved GVL puts the
		// IAB surfaces in the first HTML. Until `@inth/sdk/iab` lands the lazy
		// handle queues calls and replays them; without a handle the actions
		// are no-ops.
		const tab = this.#iabTab;
		return {
			...iab,
			...iabSurfaceActions(this.#iabHandle()),
			config: { cmpId: iab.cmpId, enabled: iab.enabled },
			isLoadingGVL: iab.enabled && !iab.gvl,
			nonIABVendors: iab.customVendors,
			preferenceCenterTab: tab(),
			setPreferenceCenterTab: (next) => tab.set(next),
		};
	}
}
